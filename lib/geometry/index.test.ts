import { describe, expect, it } from "vitest";
import { analyzeFloorPlan } from "./index";
import { PLAN_PRESETS } from "./fixtures";
import { absoluteArea, signedArea } from "./vec";
import { triangulate } from "./triangulate";

const square = [
  [0, 0],
  [5, 0],
  [5, 4],
  [0, 4],
] as Array<[number, number]>;

describe("happy path", () => {
  it("computes area, perimeter and wall area for a rectangle", () => {
    const result = analyzeFloorPlan({ outer: square });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { metrics } = result.plan;
    expect(metrics.floorArea).toBeCloseTo(20, 6);
    expect(metrics.outerPerimeter).toBeCloseTo(18, 6);
    expect(metrics.totalPerimeter).toBeCloseTo(18, 6);
    expect(metrics.wallArea).toBeCloseTo(18 * 2.8, 6);
    expect(result.plan.triangulation.triangleCount).toBe(2);
    expect(result.plan.geometrySource).toBe("input");
  });

  it("handles a reflex corner without losing area", () => {
    const preset = PLAN_PRESETS.find((p) => p.id === "l-shaped-living")!;
    const result = analyzeFloorPlan(preset.plan, { units: "m" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.metrics.floorArea).toBeCloseTo(33, 6);
    expect(result.plan.metrics.outerPerimeter).toBeCloseTo(26, 6);
    expect(result.plan.triangulation.triangleCount).toBe(4);
  });

  it("supports an inner courtyard and counts its walls", () => {
    const preset = PLAN_PRESETS.find((p) => p.id === "courtyard-villa")!;
    const result = analyzeFloorPlan(preset.plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const { metrics } = result.plan;
    expect(metrics.floorArea).toBeCloseTo(72.5, 6);
    expect(metrics.holesArea).toBeCloseTo(7.5, 6);
    expect(metrics.outerPerimeter).toBeCloseTo(36, 6);
    expect(metrics.holesPerimeter).toBeCloseTo(11, 6);
    expect(metrics.totalPerimeter).toBeCloseTo(47, 6);
    expect(metrics.wallArea).toBeCloseTo(47 * 2.8, 6);
    expect(metrics.innerWallArea).toBeCloseTo(11 * 2.8, 6);
    expect(result.plan.holes).toHaveLength(1);
    // hole ring must be clockwise after normalization
    expect(signedArea(result.plan.holes[0])).toBeLessThan(0);
  });

  it("converts millimetres without changing the result", () => {
    const preset = PLAN_PRESETS.find((p) => p.id === "millimetres")!;
    const result = analyzeFloorPlan(preset.plan, { units: "mm" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.metrics.floorArea).toBeCloseTo(20, 6);
    expect(result.plan.metrics.totalPerimeter).toBeCloseTo(18, 6);
  });

  it("emits quantity numbers without any pricing field", () => {
    const result = analyzeFloorPlan({
      outer: square,
      holes: [
        [
          [1, 1],
          [1, 2],
          [2, 2],
          [2, 1],
        ],
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { metrics } = result.plan;
    expect(metrics.quantities.tiles).toBe(Math.ceil((19 * 1.1) / 0.36));
    expect(metrics.quantities.paintLitres).toBeGreaterThan(0);
    expect(Object.keys(metrics.quantities).sort()).toEqual([
      "paintBuckets15L",
      "paintBuckets5L",
      "paintLitres",
      "tiles",
    ]);
    expect(JSON.stringify(metrics)).not.toMatch(/price|cost|usd|eur/i);
  });
});

describe("winding order", () => {
  it("flips a clockwise outer ring and reports it", () => {
    const clockwise = [
      [0, 0],
      [0, 4],
      [5, 4],
      [5, 0],
    ] as Array<[number, number]>;
    const result = analyzeFloorPlan({ outer: clockwise });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(signedArea(result.plan.outer)).toBeGreaterThan(0);
    expect(result.warnings.map((w) => w.code)).toContain("WARN_OUTER_WINDING_NORMALIZED");
    expect(result.plan.metrics.floorArea).toBeCloseTo(20, 6);
  });

  it("flips a counter-clockwise hole (cw hole is the required convention)", () => {
    const holeCCW = [
      [1, 1],
      [2, 1],
      [2, 2],
      [1, 2],
    ] as Array<[number, number]>;
    const result = analyzeFloorPlan({ outer: square, holes: [holeCCW] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(signedArea(result.plan.holes[0])).toBeLessThan(0);
    expect(result.warnings.map((w) => w.code)).toContain("WARN_HOLE_WINDING_NORMALIZED");
  });
});

describe("guardrails", () => {
  it("removes duplicate + closing vertices with warnings", () => {
    const preset = PLAN_PRESETS.find((p) => p.id === "duplicate-vertices")!;
    const result = analyzeFloorPlan(preset.plan);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.outer).toHaveLength(4);
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(["WARN_DUPLICATE_VERTEX_REMOVED", "WARN_CLOSING_POINT_REMOVED"]),
    );
  });

  it("rejects a pinch point where a non-adjacent vertex repeats", () => {
    const pinched = [
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 2],
      [0, 4],
      [2, 2],
    ] as Array<[number, number]>;
    const result = analyzeFloorPlan({ outer: pinched });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_DUPLICATE_VERTEX");
  });

  it("rejects a self-intersecting bowtie instead of rendering it", () => {
    const preset = PLAN_PRESETS.find((p) => p.id === "bowtie")!;
    const result = analyzeFloorPlan(preset.plan);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_MULTIPLE_REGIONS");
    expect(result.error.detail?.areas).toHaveLength(2);
  });

  it("can keep the largest region when explicitly allowed", () => {
    const preset = PLAN_PRESETS.find((p) => p.id === "bowtie")!;
    const result = analyzeFloorPlan(preset.plan, { onMultipleRegions: "largest" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.repaired).toBe(true);
    expect(result.plan.geometrySource).toBe("cleaned");
    expect(result.warnings.map((w) => w.code)).toContain("WARN_MULTIPLE_REGIONS_TRUNCATED");
    expect(result.plan.metrics.floorArea).toBeCloseTo(4, 6);
  });

  it("rejects holes outside the outline", () => {
    const preset = PLAN_PRESETS.find((p) => p.id === "hole-outside")!;
    const result = analyzeFloorPlan(preset.plan);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_HOLE_OUTSIDE");
  });

  it("rejects overlapping holes", () => {
    const result = analyzeFloorPlan({
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [
        [
          [1, 1],
          [1, 4],
          [4, 4],
          [4, 1],
        ],
        [
          [2, 2],
          [2, 5],
          [5, 5],
          [5, 2],
        ],
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_HOLE_OVERLAP");
  });

  it("rejects a hole touching the outer boundary", () => {
    const result = analyzeFloorPlan({
      outer: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      holes: [
        [
          [0, 2],
          [0, 5],
          [3, 5],
          [3, 2],
        ],
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_HOLE_TOUCHES_OUTER");
  });

  it("rejects collinear input and fewer than three distinct points", () => {
    const result = analyzeFloorPlan({
      outer: [
        [0, 0],
        [2, 0],
        [4, 0],
        [6, 0],
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_DEGENERATE_RING");
  });

  it("rejects malformed coordinates", () => {
    const result = analyzeFloorPlan({
      outer: [
        [0, 0],
        [5, Number.NaN],
        [5, 4],
      ],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ERR_INPUT_EMPTY");
  });

  it("never returns a plan with a triangulation gap", () => {
    for (const preset of PLAN_PRESETS) {
      const result = analyzeFloorPlan(preset.plan, { units: preset.units });
      if (result.ok) {
        const covered = result.plan.triangulation.triangleArea;
        const net = result.plan.metrics.floorArea;
        expect(Math.abs(covered - net) / Math.max(net, 1e-6)).toBeLessThan(2e-3);
      }
    }
  });
});

describe("triangulation audit", () => {
  it("accepts a valid rectangle and covers its area", () => {
    const tri = triangulate(square, []);
    expect(tri.ok).toBe(true);
    if (!tri.ok) return;
    expect(tri.triangleCount).toBe(2);
    expect(tri.deviation).toBeLessThan(1e-9);
  });

  it("refuses to report success for a self-intersecting ring", () => {
    const bowtie = [
      [0, 0],
      [4, 4],
      [4, 0],
      [0, 4],
    ] as Array<[number, number]>;
    const tri = triangulate(bowtie, []);
    expect(tri.ok).toBe(false);
  });
});

describe("metrics helpers", () => {
  it("keeps signed area sign convention", () => {
    expect(signedArea(square)).toBeGreaterThan(0);
    expect(absoluteArea(square)).toBeCloseTo(20, 9);
  });
});
