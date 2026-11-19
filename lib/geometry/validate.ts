import type { GeometryError, GeometryWarning, Point2, Ring } from "./types";
import { distance, orient, pointInRing, pointOnSegment, segmentIntersection, signedArea } from "./vec";

export interface RingIssue {
  kind: "cross" | "touch" | "overlap";
  point: Point2;
  edges: [number, number];
}

export interface NormalizedRing {
  ring: Ring;
  warnings: GeometryWarning[];
  closedRingStripped: boolean;
  duplicateVerticesRemoved: number;
  collinearVerticesRemoved: number;
  /** Non-adjacent vertices that coincide => the ring pinches itself. */
  pinchPairs: Array<[number, number]>;
}

/**
 * Removes the closing point, consecutive duplicates and collinear vertices.
 * These are all *harmless* defects that would otherwise poison earcut, so they
 * are repaired silently (with a warning) rather than rejected.
 */
export function normalizeRing(input: Ring, eps: number, label = "outer"): NormalizedRing {
  const warnings: GeometryWarning[] = [];
  let ring: Ring = input.map((p) => [p[0], p[1]] as Point2);
  let closedRingStripped = false;
  let duplicateVerticesRemoved = 0;
  let collinearVerticesRemoved = 0;

  if (ring.length > 1 && distance(ring[0], ring[ring.length - 1]) <= eps) {
    ring = ring.slice(0, -1);
    closedRingStripped = true;
    warnings.push({
      code: "WARN_CLOSING_POINT_REMOVED",
      message: `${label}: closing point equals the first vertex and was removed.`,
    });
  }

  let changed = true;
  while (changed && ring.length > 0) {
    changed = false;

    // Consecutive duplicates (also catches a 1-point ring folding onto itself).
    for (let i = 0; i < ring.length && ring.length > 1; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      if (distance(a, b) <= eps) {
        ring = ring.filter((_, index) => index !== ((i + 1) % ring.length));
        duplicateVerticesRemoved += 1;
        changed = true;
        break;
      }
    }
    if (changed) continue;

    // Collinear mid-points: geometrically redundant, numerically dangerous.
    if (ring.length >= 3) {
      for (let i = 0; i < ring.length; i += 1) {
        const prev = ring[(i - 1 + ring.length) % ring.length];
        const cur = ring[i];
        const next = ring[(i + 1) % ring.length];
        if (orient(prev, cur, next, eps) === 0 && pointOnSegment(cur, prev, next, eps)) {
          ring = ring.filter((_, index) => index !== i);
          collinearVerticesRemoved += 1;
          changed = true;
          break;
        }
      }
    }
  }

  if (duplicateVerticesRemoved > 0) {
    warnings.push({
      code: "WARN_DUPLICATE_VERTEX_REMOVED",
      message: `${label}: ${duplicateVerticesRemoved} duplicate vertex/vertices removed.`,
      context: { count: duplicateVerticesRemoved },
    });
  }
  if (collinearVerticesRemoved > 0) {
    warnings.push({
      code: "WARN_COLLINEAR_VERTEX_REMOVED",
      message: `${label}: ${collinearVerticesRemoved} collinear vertex/vertices removed.`,
      context: { count: collinearVerticesRemoved },
    });
  }

  const pinchPairs: Array<[number, number]> = [];
  for (let i = 0; i < ring.length; i += 1) {
    for (let j = i + 1; j < ring.length; j += 1) {
      if (distance(ring[i], ring[j]) <= eps) pinchPairs.push([i, j]);
    }
  }

  return {
    ring,
    warnings,
    closedRingStripped,
    duplicateVerticesRemoved,
    collinearVerticesRemoved,
    pinchPairs,
  };
}

/**
 * Finds every place where a ring touches or crosses itself.
 *
 * earcut never throws on these inputs — it silently emits overlapping or
 * zero-area triangles — so this check is the only thing standing between a
 * broken drawing and a broken mesh.
 */
export function findRingIssues(ring: readonly Point2[], eps: number): RingIssue[] {
  const issues: RingIssue[] = [];
  const n = ring.length;
  if (n < 3) return issues;

  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (distance(a, b) <= eps) continue;

    for (let j = i + 1; j < n; j += 1) {
      // Adjacent edges legally share a vertex — but not a whole stretch.
      const adjacent = j === i + 1 || (i === 0 && j === n - 1);
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if (distance(c, d) <= eps) continue;

      const hit = segmentIntersection(a, b, c, d, eps);
      if (!hit) continue;

      if (adjacent) {
        if (hit.relation === "overlap") {
          issues.push({ kind: "overlap", point: hit.point, edges: [i, j] });
        }
        continue;
      }
      issues.push({ kind: hit.relation, point: hit.point, edges: [i, j] });
    }
  }

  return issues;
}

/** Self-intersection guardrail for a single ring. */
export function checkSelfIntersection(
  ring: readonly Point2[],
  eps: number,
  label = "outer",
): GeometryError | null {
  const issues = findRingIssues(ring, eps);
  if (issues.length === 0) return null;

  const crossing = issues.find((issue) => issue.kind !== "touch");
  const first = crossing ?? issues[0];
  return {
    code: "ERR_SELF_INTERSECTION",
    message:
      `${label}: polygon is not simple — ${
        first.kind === "cross" ? "two edges cross" : first.kind === "overlap" ? "two edges overlap" : "two edges touch"
      } at (${round(first.point[0])}, ${round(first.point[1])}).`,
    hint: "Redraw the outline so edges only meet at consecutive corners, or let the cleanup pass (polygon-clipping) repair it.",
    detail: {
      issueCount: issues.length,
      firstIssue: { kind: first.kind, point: first.point, edges: first.edges },
    },
  };
}

/**
 * Validates the hole topology: holes must sit strictly inside the outer ring,
 * must not touch its boundary and must not overlap each other (including nesting).
 */
export function checkHoles(outer: readonly Point2[], holes: readonly Ring[], eps: number): GeometryError | null {
  for (let h = 0; h < holes.length; h += 1) {
    const hole = holes[h];
    for (const vertex of hole) {
      const where = pointInRing(vertex, outer, eps * 10);
      if (where === "boundary") {
        return {
          code: "ERR_HOLE_TOUCHES_OUTER",
          message: `hole #${h + 1}: vertex (${round(vertex[0])}, ${round(vertex[1])}) lies on the outer boundary.`,
          hint: "Leave a gap between courtyards and the outer wall — a hole must be strictly inside.",
        };
      }
      if (where === "outside") {
        return {
          code: "ERR_HOLE_OUTSIDE",
          message: `hole #${h + 1}: vertex (${round(vertex[0])}, ${round(vertex[1])}) is outside the outer polygon.`,
          hint: "Check the hole coordinates; they must sit inside the room outline.",
        };
      }
    }

    for (let i = 0; i < outer.length; i += 1) {
      const a = outer[i];
      const b = outer[(i + 1) % outer.length];
      const seen = new Set<Point2>();
      for (const vertex of hole) {
        if (seen.has(vertex)) continue;
        seen.add(vertex);
        if (pointOnSegment(vertex, a, b, eps)) {
          return {
            code: "ERR_HOLE_TOUCHES_OUTER",
            message: `hole #${h + 1}: touches the outer boundary at (${round(vertex[0])}, ${round(vertex[1])}).`,
            hint: "Courtyards must be strictly inside; move them inward by at least the wall thickness.",
          };
        }
      }
    }
  }

  for (let i = 0; i < holes.length; i += 1) {
    for (let j = i + 1; j < holes.length; j += 1) {
      const a = holes[i];
      const b = holes[j];
      for (let ei = 0; ei < a.length; ei += 1) {
        const p1 = a[ei];
        const p2 = a[(ei + 1) % a.length];
        for (let ej = 0; ej < b.length; ej += 1) {
          const p3 = b[ej];
          const p4 = b[(ej + 1) % b.length];
          const hit = segmentIntersection(p1, p2, p3, p4, eps);
          if (hit) {
            return {
              code: "ERR_HOLE_OVERLAP",
              message: `holes #${i + 1} and #${j + 1} overlap at (${round(hit.point[0])}, ${round(hit.point[1])}).`,
              hint: "Merge the overlapping courtyards into one hole, or separate them.",
            };
          }
        }
      }
      if (pointInRing(b[0], a, eps * 10) === "inside" || pointInRing(a[0], b, eps * 10) === "inside") {
        return {
          code: "ERR_HOLE_OVERLAP",
          message: `hole #${j + 1} is nested inside hole #${i + 1}.`,
          hint: "Nested holes are not supported — use a single hole for the courtyard.",
        };
      }
    }
  }

  return null;
}

/** Ring-level sanity check: enough distinct corners to close a polygon. */
export function validateRingPointCount(ring: Ring, label: string): GeometryError | null {
  if (ring.length < 3) {
    return {
      code: "ERR_TOO_FEW_POINTS",
      message: `${label}: needs at least 3 distinct vertices, got ${ring.length}.`,
      hint: "A room outline needs three or more corners.",
    };
  }
  return null;
}

/** Ring-level sanity check: the ring must actually enclose an area. */
export function validateRingArea(ring: Ring, label: string): GeometryError | null {
  const area = Math.abs(signedArea(ring));
  if (area < 1e-4) {
    return {
      code: "ERR_DEGENERATE_RING",
      message: `${label}: area is ~0 m² — the vertices are collinear or the ring folds onto itself.`,
      hint: "Spread the corners out; the polygon must enclose an area.",
    };
  }
  return null;
}

/** Backwards-compatible combined check (count first, then area). */
export function validateRingShape(ring: Ring, label: string): GeometryError | null {
  return validateRingPointCount(ring, label) ?? validateRingArea(ring, label);
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
