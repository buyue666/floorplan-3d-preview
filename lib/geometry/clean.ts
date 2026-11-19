import type { MultiPolygon } from "polygon-clipping";
import polygonClipping from "./polygon-clipping-shim";
import type { Point2, Ring } from "./types";
import { absoluteArea } from "./vec";

export interface CleanedRegion {
  outer: Ring;
  holes: Ring[];
  area: number;
}

export interface CleanOutcome {
  regions: CleanedRegion[];
  /** Holes that vanished because they did not intersect the subject. */
  droppedHoles: number;
}

/**
 * Fallback cleanup using polygon-clipping (a Martinez-Rueda implementation).
 *
 * `union` on a single self-intersecting polygon resolves the crossing into
 * simple rings; `difference` then subtracts the courtyards. Both operations
 * silently *repair* geometry, which is exactly why the caller must re-run the
 * full validation afterwards instead of trusting the result.
 */
export function cleanWithPolygonClipping(
  outer: Ring,
  holes: Ring[],
  eps: number,
): CleanOutcome | null {
  if (outer.length < 3) return null;

  try {
    const subject: MultiPolygon = [[toPairRing(outer)]];
    let resolved = polygonClipping.union(subject);
    if (!resolved || resolved.length === 0) return null;

    if (holes.length > 0) {
      const clip: MultiPolygon[] = holes
        .filter((hole) => hole.length >= 3)
        .map((hole) => [[toPairRing(hole)]] as MultiPolygon);
      if (clip.length > 0) {
        resolved = polygonClipping.difference(resolved, ...clip);
      }
    }
    if (!resolved || resolved.length === 0) return null;

    const regions: CleanedRegion[] = [];
    for (const polygon of resolved) {
      const outerRing = polygon[0];
      if (!outerRing || outerRing.length < 3) continue;
      const cleanedOuter = dedupe(outerRing, eps);
      if (cleanedOuter.length < 3) continue;
      const cleanedHoles = polygon
        .slice(1)
        .map((ring) => dedupe(ring, eps))
        .filter((ring) => ring.length >= 3 && absoluteArea(ring) > 1e-6);

      regions.push({
        outer: cleanedOuter,
        holes: cleanedHoles,
        area: absoluteArea(cleanedOuter) - cleanedHoles.reduce((sum, h) => sum + absoluteArea(h), 0),
      });
    }

    regions.sort((a, b) => b.area - a.area);

    const producedHoles = regions.reduce((sum, region) => sum + region.holes.length, 0);
    return { regions, droppedHoles: Math.max(0, holes.length - producedHoles) };
  } catch {
    // polygon-clipping throws on unrecoverable input (e.g. NaN, zero-area rings).
    return null;
  }
}

function toPairRing(ring: Ring): Array<[number, number]> {
  return ring.map(([x, y]) => [x, y] as [number, number]);
}

/** polygon-clipping usually returns closed rings; strip repeats and slivers. */
function dedupe(ring: Array<[number, number]>, eps: number): Ring {
  const out: Ring = [];
  for (const [x, y] of ring) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last[0] - x, last[1] - y) <= eps) continue;
    out.push([x, y] as Point2);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) <= eps) {
    out.pop();
  }
  return out;
}
