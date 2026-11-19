import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { getSurfaceMaterial } from "@/lib/materials/surfaces";
import { createFloorGeometry, createWallBoxes, createWallGeometry } from "@/lib/three/roomMesh";
import type { ValidatedFloorPlan } from "@/lib/geometry/types";
import type { SurfaceMaterialId } from "@/lib/materials/surfaces";

export interface ExportOptions {
  roomName: string;
  wallHeight: number;
  wallThickness?: number;
  floorMaterial: SurfaceMaterialId;
  wallMaterial: SurfaceMaterialId;
}

/**
 * Builds a clean export group from the *validated* plan rather than cloning the
 * live scene, so helpers (grid, contact shadows, gizmos) can never leak into
 * the GLB.
 */
export function buildExportGroup(plan: ValidatedFloorPlan, options: ExportOptions): THREE.Group {
  const group = new THREE.Group();
  group.name = options.roomName;

  const floor = new THREE.Mesh(createFloorGeometry(plan), getSurfaceMaterial(options.floorMaterial));
  floor.name = "Floor";
  floor.receiveShadow = true;
  group.add(floor);

  const boxes = createWallBoxes(plan, options.wallHeight, options.wallThickness ?? 0.12);
  const wallMaterial = getSurfaceMaterial(options.wallMaterial);
  boxes.forEach((box) => {
    const mesh = new THREE.Mesh(createWallGeometry(box), wallMaterial);
    mesh.name = `Wall_${box.ring}_${box.index}`;
    mesh.position.set(box.center[0], box.center[1], box.center[2]);
    mesh.rotation.y = box.rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return group;
}

export async function groupToGlb(group: THREE.Group): Promise<Blob> {
  const exporter = new GLTFExporter();
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      group,
      (result) => resolve(result as ArrayBuffer),
      (error) => reject(error instanceof Error ? error : new Error(String(error))),
      { binary: true, onlyVisible: true },
    );
  });
  return new Blob([buffer], { type: "model/gltf-binary" });
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "room"
  );
}
