import * as THREE from "three";
import type { Point2, ValidatedFloorPlan } from "@/lib/geometry/types";

export type RingKey = "outer" | `hole-${number}`;

export interface WallBox {
  key: string;
  ring: RingKey;
  index: number;
  /** World-space centre of the panel (y is half the wall height). */
  center: [number, number, number];
  rotationY: number;
  /** Edge length in metres. */
  length: number;
  height: number;
  thickness: number;
  start: Point2;
  end: Point2;
}

/**
 * Floor slab built straight from the audited triangulation.
 *
 * Plan space is (x, y) with y pointing "north"; three.js is Y-up, so plan y
 * becomes world z. That mapping flips handedness, therefore every triangle is
 * emitted as (a, c, b) to keep the normal pointing +Y.
 */
export function createFloorGeometry(plan: ValidatedFloorPlan): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const { vertices, indices } = plan;

  for (let i = 0; i < indices.length; i += 3) {
    const a = vertices[indices[i]];
    const b = vertices[indices[i + 1]];
    const c = vertices[indices[i + 2]];
    if (!a || !b || !c) continue;

    for (const p of [a, c, b]) {
      positions.push(p[0], 0, p[1]);
      // World-space UV: 1 unit == 1 metre so tile size is physically correct.
      uvs.push(p[0], p[1]);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Walls are one thin box per polygon edge (including every hole edge).
 * Avoiding a polygon offset keeps reflex corners and narrow rooms safe — a
 * bevelled miter offset is its own source of self-intersection.
 */
export function createWallBoxes(
  plan: ValidatedFloorPlan,
  height: number,
  thickness: number,
): WallBox[] {
  const boxes: WallBox[] = [];
  const rings: Array<{ key: RingKey; ring: Point2[] }> = [{ key: "outer", ring: plan.outer }];
  plan.holes.forEach((hole, index) => rings.push({ key: `hole-${index}`, ring: hole }));

  for (const { key, ring } of rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dx, dy);
      if (length < 1e-4) continue;

      boxes.push({
        key: `${key}-${i}`,
        ring: key,
        index: i,
        center: [(a[0] + b[0]) / 2, height / 2, (a[1] + b[1]) / 2],
        // Rotating +X by θ around Y maps to (cosθ, 0, -sinθ); solve for the edge.
        rotationY: -Math.atan2(dy, dx),
        length,
        height,
        thickness,
        start: [a[0], a[1]],
        end: [b[0], b[1]],
      });
    }
  }

  return boxes;
}

/** Box slightly longer than the edge so corners close without visible notches. */
export function createWallGeometry(box: WallBox): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(box.length + box.thickness, box.height, box.thickness, 1, 1, 1);
  applyMeterUV(geometry, box.length + box.thickness);
  return geometry;
}

/**
 * Replaces BoxGeometry's 0..1 UVs with a metric triplanar projection so a
 * 600 mm tile is 600 mm on every face, whatever the wall length.
 */
export function applyMeterUV(geometry: THREE.BufferGeometry, lengthOverride?: number): void {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const uv = new Float32Array(position.count * 2);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i < position.count; i += 1) {
    p.fromBufferAttribute(position, i);
    n.fromBufferAttribute(normal, i);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);

    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = p.x;
      v = p.z;
    } else if (ax >= az) {
      u = p.z;
      v = p.y;
    } else {
      u = p.x;
      v = p.y;
    }

    if (lengthOverride) u += lengthOverride / 2;
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }

  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}
