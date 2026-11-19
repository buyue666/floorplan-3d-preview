/**
 * Shared types for the floor-plan geometry core.
 *
 * Everything in this module is framework-agnostic and runs in plain TS
 * (browser or node). The 3D layer must only ever consume `ValidatedFloorPlan`,
 * which can only be produced by `analyzeFloorPlan`.
 */

export type Point2 = [number, number];

export type Ring = Point2[];

/** Raw user input: accepts tuples or plain number arrays so JSON/Supabase can round-trip. */
export interface RawFloorPlan {
  outer: Array<Point2 | number[]>;
  holes?: Array<Array<Point2 | number[]>>;
}

export type GeometryErrorCode =
  | "ERR_INPUT_EMPTY"
  | "ERR_TOO_FEW_POINTS"
  | "ERR_DUPLICATE_VERTEX"
  | "ERR_DEGENERATE_RING"
  | "ERR_SELF_INTERSECTION"
  | "ERR_HOLE_OUTSIDE"
  | "ERR_HOLE_OVERLAP"
  | "ERR_HOLE_TOUCHES_OUTER"
  | "ERR_MULTIPLE_REGIONS"
  | "ERR_CLEAN_FAILED"
  | "ERR_TRIANGULATION_FAILED";

export type GeometryWarningCode =
  | "WARN_CLOSING_POINT_REMOVED"
  | "WARN_DUPLICATE_VERTEX_REMOVED"
  | "WARN_COLLINEAR_VERTEX_REMOVED"
  | "WARN_OUTER_WINDING_NORMALIZED"
  | "WARN_HOLE_WINDING_NORMALIZED"
  | "WARN_EMPTY_HOLE_REMOVED"
  | "WARN_SELF_INTERSECTION_REPAIRED"
  | "WARN_MULTIPLE_REGIONS_TRUNCATED"
  | "WARN_AREA_CHANGED_BY_CLEANUP";

export interface GeometryWarning {
  code: GeometryWarningCode;
  message: string;
  context?: Record<string, unknown>;
}

export interface GeometryError {
  code: GeometryErrorCode;
  message: string;
  /** Human readable next step, shown in the UI error card. */
  hint?: string;
  detail?: Record<string, unknown>;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface QuantitySpec {
  /** Tile format in metres, used for floor tiling quantities. */
  tileWidth: number;
  tileHeight: number;
  /** Extra percentage for cuts / breakage, e.g. 0.1 = +10%. */
  wasteRatio: number;
  /** Paint coverage in m² per litre (single coat). */
  paintCoverage: number;
  /** Number of coats assumed for the paint quantity. */
  paintCoats: number;
}

export interface PlanMetrics {
  /** Net floor area = outer area - sum(hole areas), m². */
  floorArea: number;
  outerArea: number;
  holesArea: number;
  /** Perimeter of the outer ring, m. */
  outerPerimeter: number;
  /** Sum of every hole perimeter — inner courtyards still need walls, m. */
  holesPerimeter: number;
  /** outerPerimeter + holesPerimeter, m. */
  totalPerimeter: number;
  wallHeight: number;
  /** totalPerimeter * wallHeight, m². */
  wallArea: number;
  /** outerPerimeter * wallHeight, m². */
  outerWallArea: number;
  /** holesPerimeter * wallHeight, m². */
  innerWallArea: number;
  centroid: Point2;
  boundingBox: BoundingBox;
  quantities: {
    /** Whole tiles incl. waste. */
    tiles: number;
    /** litres for `paintCoats` coats. */
    paintLitres: number;
    /** 5 L / 15 L buckets, rounded up. */
    paintBuckets5L: number;
    paintBuckets15L: number;
  };
}

export interface TriangulationResult {
  /** Flattened vertex list: outer ring first, then each hole. */
  vertices: Point2[];
  /** Flat triples, indices into `vertices`. */
  indices: number[];
  triangleCount: number;
  /** Sum of triangle areas, m². */
  triangleArea: number;
  /** |triangleArea - expectedArea| / expectedArea. */
  deviation: number;
}

export interface ValidatedFloorPlan {
  /** Brand: only `analyzeFloorPlan` can mint this. */
  readonly kind: "validated-floor-plan";
  /** Outer ring, normalized to CCW, no closing duplicate. */
  outer: Ring;
  /** Holes, normalized to CW, no closing duplicates. */
  holes: Ring[];
  vertices: Point2[];
  indices: number[];
  triangulation: TriangulationResult;
  metrics: PlanMetrics;
  warnings: GeometryWarning[];
  /** True when polygon-clipping had to rewrite the input. */
  repaired: boolean;
  /** Where the final geometry came from. */
  geometrySource: "input" | "cleaned";
}

export type PlanAnalysis =
  | { ok: true; plan: ValidatedFloorPlan; warnings: GeometryWarning[] }
  | { ok: false; error: GeometryError; warnings: GeometryWarning[] };

export type LengthUnit = "m" | "cm" | "mm" | "ft";

export interface AnalyzeOptions {
  /** Input unit, converted to metres internally. Default "m". */
  units?: LengthUnit;
  /** Wall height in metres, default 2.8. */
  wallHeight?: number;
  /** Wall thickness in metres, default 0.12 (visual only). */
  wallThickness?: number;
  /** Snapping tolerance in metres, default 1e-7 for m input scaled per unit. */
  epsilon?: number;
  /** Tile / paint assumptions for the quantity numbers. */
  quantities?: Partial<QuantitySpec>;
  /**
   * What to do when cleanup splits the polygon into disjoint regions.
   * "error" (default) surfaces ERR_MULTIPLE_REGIONS; "largest" keeps the biggest.
   */
  onMultipleRegions?: "error" | "largest";
}

export const DEFAULT_QUANTITIES: QuantitySpec = {
  tileWidth: 0.6,
  tileHeight: 0.6,
  wasteRatio: 0.1,
  paintCoverage: 10,
  paintCoats: 2,
};

export const DEFAULT_WALL_HEIGHT = 2.8;
export const DEFAULT_WALL_THICKNESS = 0.12;
