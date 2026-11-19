import earcut from "earcut";
import type { Point2, Ring } from "./types";
import { absoluteArea } from "./vec";

/**
 * Triangulation with earcut plus an independent result audit.
 *
 * earcut is deliberately forgiving: on self-intersecting or degenerate input it
 * returns *something* (often a partially covering fan of triangles) instead of
 * throwing. So the contract here is "triangulate, then prove the output covers
 * the polygon" — callers must treat `ok:false` as "do not render".
 */

export interface TriangulationOutcome {
  ok: true;
  vertices: Point2[];
  indices: number[];
  triangleCount: number;
  triangleArea: number;
  expectedArea: number;
  deviation: number;
  degenerateTriangles: number;
}

export interface TriangulationFailure {
  ok: false;
  reason: string;
  detail?: Record<string, unknown>;
}

const RELATIVE_TOLERANCE = 0.002;
const ABSOLUTE_TOLERANCE = 1e-6;

export function triangulate(
  outer: Ring,
  holes: Ring[],
): TriangulationOutcome | TriangulationFailure {
  const vertices: Point2[] = [];
  const holeIndices: number[] = [];
  for (const p of outer) vertices.push([p[0], p[1]]);
  for (const hole of holes) {
    if (hole.length === 0) continue;
    holeIndices.push(vertices.length);
    for (const p of hole) vertices.push([p[0], p[1]]);
  }

  const flat = new Float64Array(vertices.length * 2);
  vertices.forEach((p, i) => {
    flat[i * 2] = p[0];
    flat[i * 2 + 1] = p[1];
  });

  let indices: number[];
  try {
    indices = earcut(flat, holeIndices.length > 0 ? holeIndices : undefined, 2);
  } catch (error) {
    return {
      ok: false,
      reason: `earcut threw: ${(error as Error).message}`,
      detail: { vertexCount: vertices.length, holeCount: holes.length },
    };
  }

  if (!indices || indices.length === 0) {
    return { ok: false, reason: "earcut produced no triangles.", detail: { vertexCount: vertices.length } };
  }
  if (indices.length % 3 !== 0) {
    return { ok: false, reason: `earcut returned ${indices.length} indices, not a multiple of 3.` };
  }
  if (indices.some((index) => index < 0 || index >= vertices.length)) {
    return { ok: false, reason: "earcut returned an out-of-range vertex index." };
  }

  let areaSum = 0;
  let degenerate = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = vertices[indices[i]];
    const b = vertices[indices[i + 1]];
    const c = vertices[indices[i + 2]];
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    if (area < 1e-12) degenerate += 1;
    areaSum += area;
  }

  const expectedArea = Math.max(0, absoluteArea(outer) - holes.reduce((sum, hole) => sum + absoluteArea(hole), 0));
  const deviation = expectedArea > 0 ? Math.abs(areaSum - expectedArea) / expectedArea : areaSum;

  const triangleCount = indices.length / 3;
  const expectedTriangles = vertices.length + 2 * holes.filter((h) => h.length > 0).length - 2;
  const tolerance = Math.max(ABSOLUTE_TOLERANCE, expectedArea * RELATIVE_TOLERANCE);

  if (Math.abs(areaSum - expectedArea) > tolerance) {
    return {
      ok: false,
      reason: `triangulated area ${areaSum.toFixed(4)} m² does not match polygon area ${expectedArea.toFixed(4)} m².`,
      detail: { areaSum, expectedArea, deviation, triangleCount, expectedTriangles },
    };
  }
  if (degenerate > triangleCount * 0.25) {
    return {
      ok: false,
      reason: `${degenerate}/${triangleCount} triangles are degenerate.`,
      detail: { degenerate, triangleCount },
    };
  }

  return {
    ok: true,
    vertices,
    indices,
    triangleCount,
    triangleArea: areaSum,
    expectedArea,
    deviation,
    degenerateTriangles: degenerate,
  };
}

/** Ensure every triangle is wound CCW in plan space so normals point up. */
export function orientTrianglesCCW(vertices: Point2[], indices: number[]): number[] {
  const out = indices.slice();
  for (let i = 0; i < out.length; i += 3) {
    const a = vertices[out[i]];
    const b = vertices[out[i + 1]];
    const c = vertices[out[i + 2]];
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (cross < 0) {
      const tmp = out[i + 1];
      out[i + 1] = out[i + 2];
      out[i + 2] = tmp;
    }
  }
  return out;
}



