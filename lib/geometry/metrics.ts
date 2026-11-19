import type { PlanMetrics, Point2, QuantitySpec, Ring } from "./types";
import { bbox, centroid, ringPerimeter, signedArea } from "./vec";

/**
 * Pure plan arithmetic. No pricing, no market data — only quantities the
 * geometry itself can prove.
 *
 *   floor area  = outer area - sum(hole areas)
 *   wall area   = (outer perimeter + sum(hole perimeters)) * wall height
 *
 * Hole perimeters matter: an inner courtyard has walls on all four sides.
 */
export function computeMetrics(
  outer: Ring,
  holes: Ring[],
  wallHeight: number,
  quantities: QuantitySpec,
): PlanMetrics {
  // The outer ring is CCW (positive) and holes are CW (negative), so summing
  // signed areas directly yields net area.
  const outerArea = Math.abs(signedArea(outer));
  const holesArea = holes.reduce((sum, hole) => sum + Math.abs(signedArea(hole)), 0);
  const floorArea = Math.max(0, outerArea - holesArea);

  const outerPerimeter = ringPerimeter(outer);
  const holesPerimeter = holes.reduce((sum, hole) => sum + ringPerimeter(hole), 0);
  const totalPerimeter = outerPerimeter + holesPerimeter;

  const wallArea = totalPerimeter * wallHeight;
  const tileArea = Math.max(1e-6, quantities.tileWidth * quantities.tileHeight);
  const tiles = Math.ceil((floorArea * (1 + quantities.wasteRatio)) / tileArea);
  const paintLitres =
    Math.round(((wallArea * quantities.paintCoats) / Math.max(0.1, quantities.paintCoverage)) * 10) / 10;

  const allRings = [outer, ...holes];
  const box = bbox(allRings);

  return {
    floorArea,
    outerArea,
    holesArea,
    outerPerimeter,
    holesPerimeter,
    totalPerimeter,
    wallHeight,
    wallArea,
    outerWallArea: outerPerimeter * wallHeight,
    innerWallArea: holesPerimeter * wallHeight,
    centroid: centroid(outer) as Point2,
    boundingBox: box,
    quantities: {
      tiles,
      paintLitres,
      paintBuckets5L: Math.ceil(paintLitres / 5),
      paintBuckets15L: Math.ceil(paintLitres / 15),
    },
  };
}
