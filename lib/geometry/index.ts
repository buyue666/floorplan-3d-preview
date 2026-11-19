import { cleanWithPolygonClipping } from "./clean";
import { computeMetrics } from "./metrics";
import { orientTrianglesCCW, triangulate, type TriangulationOutcome } from "./triangulate";
import {
  DEFAULT_QUANTITIES,
  DEFAULT_WALL_HEIGHT,
  type AnalyzeOptions,
  type GeometryError,
  type GeometryWarning,
  type LengthUnit,
  type PlanAnalysis,
  type RawFloorPlan,
  type Ring,
  type ValidatedFloorPlan,
} from "./types";
import {
  checkHoles,
  checkSelfIntersection,
  findRingIssues,
  normalizeRing,
  validateRingArea,
  validateRingPointCount,
} from "./validate";
import { absoluteArea, reverseRing, signedArea } from "./vec";

export const UNIT_SCALE: Record<LengthUnit, number> = {
  m: 1,
  cm: 0.01,
  mm: 0.001,
  ft: 0.3048,
};

type ReadRingResult = { ok: true; ring: Ring } | { ok: false; error: GeometryError };

/**
 * The single entry point of the geometry core.
 *
 * Pipeline: parse -> normalize -> diagnose -> (triangulate | clean + retriangulate)
 * -> metrics. It never throws and never returns a plan that failed the audit.
 */
export function analyzeFloorPlan(input: RawFloorPlan, options: AnalyzeOptions = {}): PlanAnalysis {
  const warnings: GeometryWarning[] = [];
  const unitScale = UNIT_SCALE[options.units ?? "m"];
  const eps = options.epsilon ?? 1e-6;
  const wallHeight = options.wallHeight ?? DEFAULT_WALL_HEIGHT;
  const quantities = { ...DEFAULT_QUANTITIES, ...options.quantities };

  const fail = (error: GeometryError): PlanAnalysis => ({ ok: false, error, warnings });

  if (!input || !input.outer) {
    return fail({
      code: "ERR_INPUT_EMPTY",
      message: "No outer polygon supplied.",
      hint: "Provide an outline with at least three x,y vertices.",
    });
  }

  // ---------------------------------------------------------------- outer ring
  const readOuter = readRing(input.outer, unitScale, "outer");
  if (!readOuter.ok) return fail(readOuter.error);

  const earlyCount = validateRingPointCount(readOuter.ring, "outer");
  if (earlyCount) return fail(earlyCount);

  const normOuter = normalizeRing(readOuter.ring, eps, "outer");
  warnings.push(...normOuter.warnings);
  if (normOuter.ring.length < 3) {
    return fail({
      code: readOuter.ring.length >= 3 ? "ERR_DEGENERATE_RING" : "ERR_TOO_FEW_POINTS",
      message: `outer: only ${normOuter.ring.length} distinct vertex/vertices remain after removing duplicates and collinear points.`,
      hint: "A room outline needs three non-collinear corners that enclose an area.",
    });
  }
  const outerCount = validateRingPointCount(normOuter.ring, "outer");
  if (outerCount) return fail(outerCount);

  if (normOuter.pinchPairs.length > 0) {
    return fail({
      code: "ERR_DUPLICATE_VERTEX",
      message: `outer: vertex ${normOuter.pinchPairs[0][0] + 1} and ${
        normOuter.pinchPairs[0][1] + 1
      } coincide — the outline pinches itself.`,
      hint: "Remove the duplicated corner; a ring may not revisit the same point.",
      detail: { pairs: normOuter.pinchPairs },
    });
  }

  // Self-intersection is diagnosed before the area check: a symmetric bowtie has
  // zero *signed* area, and reporting it as "degenerate" would hide the real cause.
  const outerIssues = findRingIssues(normOuter.ring, eps);
  const zeroArea = Math.abs(signedArea(normOuter.ring)) < 1e-4;
  if (zeroArea && !outerIssues.some((issue) => issue.kind === "cross")) {
    return fail({
      code: "ERR_DEGENERATE_RING",
      message: "outer: the outline encloses ~0 m² — its vertices are collinear or fold back on themselves.",
      hint: "Spread the corners out; the polygon must enclose an area.",
    });
  }
  const outerSelf = outerIssues.length > 0 ? checkSelfIntersection(normOuter.ring, eps, "outer") : null;

  // ---------------------------------------------------------------------- holes
  const rawHoles = input.holes ?? [];
  const holes: Ring[] = [];
  let holesSelfIntersect = false;

  for (let i = 0; i < rawHoles.length; i += 1) {
    const raw = rawHoles[i];
    const label = `hole #${i + 1}`;
    if (!Array.isArray(raw) || raw.length === 0) {
      warnings.push({
        code: "WARN_EMPTY_HOLE_REMOVED",
        message: `${label}: empty ring ignored.`,
      });
      continue;
    }

    const readHole = readRing(raw, unitScale, label);
    if (!readHole.ok) return fail(readHole.error);

    const normHole = normalizeRing(readHole.ring, eps, label);
    warnings.push(...normHole.warnings);

    if (normHole.ring.length < 3) {
      warnings.push({
        code: "WARN_EMPTY_HOLE_REMOVED",
        message: `${label}: fewer than 3 distinct vertices after cleanup — ignored.`,
      });
      continue;
    }

    const holeCount = validateRingPointCount(normHole.ring, label);
    if (holeCount) return fail(holeCount);

    if (normHole.pinchPairs.length > 0) {
      return fail({
        code: "ERR_DUPLICATE_VERTEX",
        message: `${label}: duplicated vertex — the ring pinches itself.`,
        hint: "A hole must be a simple ring as well.",
        detail: { pairs: normHole.pinchPairs },
      });
    }

    const holeSelf = checkSelfIntersection(normHole.ring, eps, label);
    if (holeSelf) {
      holesSelfIntersect = true;
    } else {
      const holeArea = validateRingArea(normHole.ring, label);
      if (holeArea) return fail(holeArea);
    }

    holes.push(normHole.ring);
  }

  // ---------------------------------------------------------------- diagnostics
  const needsRepair = outerSelf !== null || holesSelfIntersect;

  let currentOuter = normOuter.ring;
  let currentHoles = holes;
  let geometrySource: "input" | "cleaned" = "input";

  if (!needsRepair) {
    const holeError = checkHoles(currentOuter, currentHoles, eps);
    if (holeError) return fail(holeError);
  } else if (outerSelf) {
    warnings.push({
      code: "WARN_SELF_INTERSECTION_REPAIRED",
      message: `${outerSelf.message} Attempting polygon-clipping cleanup.`,
      context: { issue: outerSelf.detail, source: "input" },
    });
  }

  // ------------------------------------------------------------- winding order
  const winding = enforceWinding(currentOuter, currentHoles, warnings);
  currentOuter = winding.outer;
  currentHoles = winding.holes;

  // -------------------------------------------------------------- triangulation
  let triangulation = needsRepair ? null : triangulate(currentOuter, currentHoles);
  let triangulationFailure: string | null = null;

  if (triangulation && !triangulation.ok) {
    triangulationFailure = triangulation.reason;
    triangulation = null;
    warnings.push({
      code: "WARN_SELF_INTERSECTION_REPAIRED",
      message: `earcut output failed validation (${triangulationFailure}). Attempting polygon-clipping cleanup.`,
    });
  }

  if (!triangulation) {
    const repair = attemptRepair(currentOuter, currentHoles, eps, options, warnings);
    if (!repair.ok) {
      return fail({
        ...repair.error,
        detail: {
          ...repair.error.detail,
          ...(triangulationFailure ? { triangulationFailure } : {}),
          ...(outerSelf ? { selfIntersection: outerSelf.detail } : {}),
        },
      });
    }

    const beforeArea = Math.max(0, absoluteArea(currentOuter) - currentHoles.reduce((s, h) => s + absoluteArea(h), 0));
    const afterArea = Math.max(
      0,
      absoluteArea(repair.outer) - repair.holes.reduce((s, h) => s + absoluteArea(h), 0),
    );

    currentOuter = repair.outer;
    currentHoles = repair.holes;
    geometrySource = "cleaned";
    triangulation = repair.triangulation;

    if (beforeArea > 1e-6 && Math.abs(afterArea - beforeArea) / beforeArea > 0.05) {
      warnings.push({
        code: "WARN_AREA_CHANGED_BY_CLEANUP",
        message: `cleanup changed the footprint by ${(((afterArea - beforeArea) / beforeArea) * 100).toFixed(
          1,
        )}% (${beforeArea.toFixed(3)} m² → ${afterArea.toFixed(3)} m²).`,
        context: { beforeArea, afterArea },
      });
    }
  }

  const oriented = orientTrianglesCCW(triangulation.vertices, triangulation.indices);

  const plan: ValidatedFloorPlan = {
    kind: "validated-floor-plan",
    outer: currentOuter,
    holes: currentHoles,
    vertices: triangulation.vertices,
    indices: oriented,
    triangulation: {
      vertices: triangulation.vertices,
      indices: oriented,
      triangleCount: triangulation.triangleCount,
      triangleArea: triangulation.triangleArea,
      deviation: triangulation.deviation,
    },
    metrics: computeMetrics(currentOuter, currentHoles, wallHeight, quantities),
    warnings,
    repaired: geometrySource === "cleaned",
    geometrySource,
  };

  return { ok: true, plan, warnings };
}

// ---------------------------------------------------------------------- helpers

function readRing(raw: Array<[number, number] | number[]>, scale: number, label: string): ReadRingResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      ok: false,
      error: {
        code: "ERR_INPUT_EMPTY",
        message: `${label}: no vertices supplied.`,
        hint: "Enter at least three “x, y” pairs, one per line.",
      },
    };
  }

  const ring: Ring = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i] as unknown;
    let x: number;
    let y: number;

    if (Array.isArray(item)) {
      x = Number(item[0]);
      y = Number(item[1]);
    } else if (item && typeof item === "object" && "x" in item && "y" in item) {
      x = Number((item as { x: unknown }).x);
      y = Number((item as { y: unknown }).y);
    } else {
      return {
        ok: false,
        error: {
          code: "ERR_INPUT_EMPTY",
          message: `${label}: vertex ${i + 1} is not an [x, y] pair.`,
          hint: "Each vertex must look like 0,0 or 3400,2150.",
        },
      };
    }

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return {
        ok: false,
        error: {
          code: "ERR_INPUT_EMPTY",
          message: `${label}: vertex ${i + 1} contains a non-finite number.`,
          hint: "Check for stray characters or NaN in the coordinate list.",
        },
      };
    }

    ring.push([x * scale, y * scale]);
  }
  return { ok: true, ring };
}

/** Outer ring CCW, holes CW — the convention three.js `Shape` and earcut both expect. */
function enforceWinding(
  outer: Ring,
  holes: Ring[],
  warnings: GeometryWarning[],
): { outer: Ring; holes: Ring[] } {
  let nextOuter = outer;
  if (signedArea(outer) < 0) {
    nextOuter = reverseRing(outer);
    warnings.push({
      code: "WARN_OUTER_WINDING_NORMALIZED",
      message: "outer: input was clockwise; reversed to CCW.",
    });
  }

  const nextHoles = holes.map((hole, index) => {
    if (signedArea(hole) > 0) {
      warnings.push({
        code: "WARN_HOLE_WINDING_NORMALIZED",
        message: `hole #${index + 1}: input was counter-clockwise; reversed to CW.`,
      });
      return reverseRing(hole);
    }
    return hole;
  });

  return { outer: nextOuter, holes: nextHoles };
}

interface RepairOutcome {
  ok: true;
  outer: Ring;
  holes: Ring[];
  triangulation: TriangulationOutcome & { ok: true };
}

type RepairResult = RepairOutcome | { ok: false; error: GeometryError };

/**
 * Cleanup pass. Every guardrail is re-applied to the cleaned output: a repaired
 * polygon that is still not simple is rejected, not rendered.
 */
function attemptRepair(
  outer: Ring,
  holes: Ring[],
  eps: number,
  options: AnalyzeOptions,
  warnings: GeometryWarning[],
): RepairResult {
  const cleaned = cleanWithPolygonClipping(outer, holes, eps);
  if (!cleaned || cleaned.regions.length === 0) {
    return {
      ok: false,
      error: {
        code: "ERR_CLEAN_FAILED",
        message: "polygon-clipping could not produce any valid region from this outline.",
        hint: "The outline is too tangled to repair automatically — redraw it, or split it into separate rooms.",
      },
    };
  }

  let region = cleaned.regions[0];
  if (cleaned.regions.length > 1) {
    if (options.onMultipleRegions === "largest") {
      warnings.push({
        code: "WARN_MULTIPLE_REGIONS_TRUNCATED",
        message: `cleanup produced ${cleaned.regions.length} disjoint regions; kept the largest (${region.area.toFixed(
          2,
        )} m²).`,
        context: { areas: cleaned.regions.map((r) => r.area) },
      });
    } else {
      return {
        ok: false,
        error: {
          code: "ERR_MULTIPLE_REGIONS",
          message: `the outline intersects itself and cleanup split it into ${cleaned.regions.length} disjoint regions (${cleaned.regions
            .map((r) => r.area.toFixed(2))
            .join(", ")} m²).`,
          hint: "A single room cannot become disconnected pieces. Redraw without crossing edges, or model each piece as its own room.",
          detail: { areas: cleaned.regions.map((r) => r.area), droppedHoles: cleaned.droppedHoles },
        },
      };
    }
  }

  if (cleaned.regions.length === 1 && cleaned.droppedHoles > 0) {
    return {
      ok: false,
      error: {
        code: "ERR_CLEAN_FAILED",
        message: `${cleaned.droppedHoles} hole(s) were dropped by cleanup because they do not intersect the repaired outline.`,
        hint: "Check that every courtyard sits inside the room outline.",
        detail: { droppedHoles: cleaned.droppedHoles },
      },
    };
  }

  // Re-normalise and re-diagnose the cleaned rings.
  const normOuter = normalizeRing(region.outer, eps, "cleaned outer");
  warnings.push(...normOuter.warnings);
  if (normOuter.ring.length < 3 || normOuter.pinchPairs.length > 0) {
    return {
      ok: false,
      error: {
        code: "ERR_CLEAN_FAILED",
        message: "cleanup returned a degenerate outer ring.",
        hint: "Simplify the outline; automatic repair cannot recover this shape.",
      },
    };
  }

  const cleanedHoles: Ring[] = [];
  for (let i = 0; i < region.holes.length; i += 1) {
    const normHole = normalizeRing(region.holes[i], eps, `cleaned hole #${i + 1}`);
    warnings.push(...normHole.warnings);
    if (normHole.ring.length < 3 || normHole.pinchPairs.length > 0 || checkSelfIntersection(normHole.ring, eps)) {
      return {
        ok: false,
        error: {
          code: "ERR_CLEAN_FAILED",
          message: `cleanup left an invalid hole (#${i + 1}).`,
          hint: "Move the courtyard inward or resize it.",
        },
      };
    }
    cleanedHoles.push(normHole.ring);
  }

  const outerIssues = checkSelfIntersection(normOuter.ring, eps, "cleaned outer");
  if (outerIssues) {
    return {
      ok: false,
      error: {
        code: "ERR_CLEAN_FAILED",
        message: `cleanup still leaves a non-simple outline. ${outerIssues.message}`,
        hint: "Redraw the outline — the crossing is too severe to repair.",
      },
    };
  }

  const holeError = checkHoles(normOuter.ring, cleanedHoles, eps);
  if (holeError) return { ok: false, error: holeError };

  region = { ...region, outer: normOuter.ring, holes: cleanedHoles };

  const winding = enforceWinding(region.outer, region.holes, warnings);
  const tri = triangulate(winding.outer, winding.holes);
  if (!tri.ok) {
    return {
      ok: false,
      error: {
        code: "ERR_TRIANGULATION_FAILED",
        message: `earcut still fails after cleanup: ${tri.reason}`,
        hint: "Split the room into simpler polygons — this outline cannot be triangulated reliably.",
        detail: { triangulationFailure: tri.reason },
      },
    };
  }

  return { ok: true, outer: winding.outer, holes: winding.holes, triangulation: tri };
}
