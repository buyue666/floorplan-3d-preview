import type { BoundingBox, Point2, Ring } from "./types";

/** Twice the signed area via the shoelace formula. Positive => CCW. */
export function signedArea(ring: readonly Point2[]): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

export function absoluteArea(ring: readonly Point2[]): number {
  return Math.abs(signedArea(ring));
}

export function ringPerimeter(ring: readonly Point2[]): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    sum += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return sum;
}

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Area-weighted polygon centroid; falls back to the vertex average for slivers. */
export function centroid(ring: readonly Point2[]): Point2 {
  let cx = 0;
  let cy = 0;
  let a2 = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % n];
    const cross = p[0] * q[1] - q[0] * p[1];
    a2 += cross;
    cx += (p[0] + q[0]) * cross;
    cy += (p[1] + q[1]) * cross;
  }
  if (Math.abs(a2) < 1e-12) {
    const avg = ring.reduce<Point2>((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
    return [avg[0] / n, avg[1] / n];
  }
  return [cx / (3 * a2), cy / (3 * a2)];
}

export function bbox(rings: readonly Ring[]): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

export type Orientation = -1 | 0 | 1;

/** Cross product of (b-a) × (c-a), collapsed to a sign with tolerance. */
export function orient(a: Point2, b: Point2, c: Point2, eps = 1e-12): Orientation {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (v > eps) return 1;
  if (v < -eps) return -1;
  return 0;
}

export type PointInRing = "inside" | "outside" | "boundary";

/** Ray-casting point-in-polygon that also reports boundary hits. */
export function pointInRing(p: Point2, ring: readonly Point2[], eps = 1e-9): PointInRing {
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (pointOnSegment(p, a, b, eps)) return "boundary";
  }
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside ? "inside" : "outside";
}

export function pointOnSegment(p: Point2, a: Point2, b: Point2, eps = 1e-9): boolean {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const len = distance(a, b);
  if (len < eps) return distance(p, a) <= eps;
  const perpendicular = Math.abs(cross) / len;
  if (perpendicular > eps) return false;
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  if (dot < -eps) return false;
  const squared = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
  return dot <= squared + eps;
}

export type SegmentRelation = "cross" | "touch" | "overlap";

export interface SegmentHit {
  relation: SegmentRelation;
  point: Point2;
}

/**
 * Intersection test for two segments that also classifies *how* they meet.
 * `touch` covers endpoint-on-segment and endpoint-endpoint contacts, which are
 * just as fatal as crossings when they happen between non-adjacent edges.
 */
export function segmentIntersection(
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
  eps = 1e-9,
): SegmentHit | null {
  const o1 = orient(a, b, c, eps);
  const o2 = orient(a, b, d, eps);
  const o3 = orient(c, d, a, eps);
  const o4 = orient(c, d, b, eps);

  if (o1 === 0 && o2 === 0 && o3 === 0 && o4 === 0) {
    // Collinear: check for a shared stretch.
    const candidates: Array<[Point2, string]> = [
      [a, "a"],
      [b, "b"],
      [c, "c"],
      [d, "d"],
    ];
    for (const [p] of candidates) {
      if (pointOnSegment(p, a, b, eps) && pointOnSegment(p, c, d, eps)) {
        const overlapLength =
          Math.min(distance(a, b), distance(c, d)) -
          Math.max(
            Math.min(distance(a, c), distance(a, d)),
            Math.min(distance(b, c), distance(b, d)),
          );
        if (overlapLength > eps) return { relation: "overlap", point: p };
        return { relation: "touch", point: p };
      }
    }
    return null;
  }

  if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) {
    const t = numerator(a, b, c, d);
    return { relation: "cross", point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
  }

  if (o1 === 0 && pointOnSegment(c, a, b, eps)) return { relation: "touch", point: c };
  if (o2 === 0 && pointOnSegment(d, a, b, eps)) return { relation: "touch", point: d };
  if (o3 === 0 && pointOnSegment(a, c, d, eps)) return { relation: "touch", point: a };
  if (o4 === 0 && pointOnSegment(b, c, d, eps)) return { relation: "touch", point: b };
  return null;
}

function numerator(a: Point2, b: Point2, c: Point2, d: Point2): number {
  const rX = b[0] - a[0];
  const rY = b[1] - a[1];
  const sX = d[0] - c[0];
  const sY = d[1] - c[1];
  const denom = rX * sY - rY * sX;
  if (Math.abs(denom) < 1e-15) return 0;
  return ((c[0] - a[0]) * sY - (c[1] - a[1]) * sX) / denom;
}

/** True when the ring has a consistent orientation and no folds. */
export function isCCW(ring: readonly Point2[]): boolean {
  return signedArea(ring) > 0;
}

export function reverseRing(ring: Ring): Ring {
  return [...ring].reverse();
}

/** Snap a coordinate to `step` to kill float noise from CAD exports. */
export function snapRing(ring: Ring, step: number): Ring {
  if (step <= 0) return ring;
  return ring.map(([x, y]) => [Math.round(x / step) * step, Math.round(y / step) * step]) as Ring;
}
