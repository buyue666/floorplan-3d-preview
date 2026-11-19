import * as THREE from "three";

export type SurfaceMaterialId =
  | "tile-porcelain"
  | "tile-stone"
  | "tile-subway"
  | "paint-warm-white"
  | "paint-sage"
  | "paint-clay";

export interface SurfaceMaterialDef {
  id: SurfaceMaterialId;
  label: string;
  kind: "tile" | "paint";
  /** Physical size of one texture repeat, metres. */
  tileSize: number;
  /** Optional second dimension for rectangular formats. */
  tileHeight?: number;
  colors: {
    base: string;
    grout?: string;
    accent: string;
  };
  roughness: number;
  metalness: number;
  /** Swatch colour for the UI. */
  swatch: string;
}

/**
 * Textures are generated on a 2D canvas at runtime — no binary assets, no
 * network calls, so the preview works offline and in CI.
 */
export const SURFACE_MATERIALS: SurfaceMaterialDef[] = [
  {
    id: "tile-porcelain",
    label: "Porcelain 600",
    kind: "tile",
    tileSize: 0.6,
    colors: { base: "#e8e2d6", grout: "#b8b0a2", accent: "#f4efe6" },
    roughness: 0.28,
    metalness: 0.02,
    swatch: "#e8e2d6",
  },
  {
    id: "tile-stone",
    label: "Stone 800",
    kind: "tile",
    tileSize: 0.8,
    colors: { base: "#cbb79a", grout: "#9a8770", accent: "#ded0b8" },
    roughness: 0.55,
    metalness: 0.01,
    swatch: "#cbb79a",
  },
  {
    id: "tile-subway",
    label: "Subway 150×75",
    kind: "tile",
    tileSize: 0.15,
    tileHeight: 0.075,
    colors: { base: "#f2f0ea", grout: "#c8c3b8", accent: "#ffffff" },
    roughness: 0.3,
    metalness: 0.02,
    swatch: "#f2f0ea",
  },
  {
    id: "paint-warm-white",
    label: "Warm white paint",
    kind: "paint",
    tileSize: 2.4,
    colors: { base: "#f5f1e8", accent: "#ece5d8", grout: undefined },
    roughness: 0.9,
    metalness: 0,
    swatch: "#f5f1e8",
  },
  {
    id: "paint-sage",
    label: "Sage paint",
    kind: "paint",
    tileSize: 2.4,
    colors: { base: "#b9c4ae", accent: "#a9b59d", grout: undefined },
    roughness: 0.92,
    metalness: 0,
    swatch: "#b9c4ae",
  },
  {
    id: "paint-clay",
    label: "Clay paint",
    kind: "paint",
    tileSize: 2.4,
    colors: { base: "#d3a986", accent: "#c4977a", grout: undefined },
    roughness: 0.88,
    metalness: 0,
    swatch: "#d3a986",
  },
];

export function getSurfaceMaterialDef(id: SurfaceMaterialId): SurfaceMaterialDef {
  return SURFACE_MATERIALS.find((material) => material.id === id) ?? SURFACE_MATERIALS[0];
}

const textureCache = new Map<SurfaceMaterialId, THREE.CanvasTexture>();
const materialCache = new Map<SurfaceMaterialId, THREE.MeshStandardMaterial>();

export function getSurfaceTexture(id: SurfaceMaterialId): THREE.CanvasTexture {
  const cached = textureCache.get(id);
  if (cached) return cached;

  const def = getSurfaceMaterialDef(id);
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  if (ctx) {
    if (def.kind === "tile") {
      paintTileCell(ctx, def);
    } else {
      paintWallCell(ctx, def);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // uv coordinates are in metres, so one repeat must equal one tile.
  const repeatX = 1 / def.tileSize;
  const repeatY = 1 / (def.tileHeight ?? def.tileSize);
  texture.repeat.set(repeatX, repeatY);
  texture.needsUpdate = true;

  textureCache.set(id, texture);
  return texture;
}

export function getSurfaceMaterial(id: SurfaceMaterialId): THREE.MeshStandardMaterial {
  const cached = materialCache.get(id);
  if (cached) return cached;

  const def = getSurfaceMaterialDef(id);
  const material = new THREE.MeshStandardMaterial({
    map: getSurfaceTexture(id),
    roughness: def.roughness,
    metalness: def.metalness,
    side: THREE.DoubleSide,
  });
  material.name = def.id;
  materialCache.set(id, material);
  return material;
}

function paintTileCell(ctx: CanvasRenderingContext2D, def: SurfaceMaterialDef): void {
  const size = ctx.canvas.width;
  const groutPx = Math.max(6, Math.round(size * 0.025));

  ctx.fillStyle = def.colors.grout ?? "#b8b0a2";
  ctx.fillRect(0, 0, size, size);

  const inner = size - groutPx * 2;
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, def.colors.accent);
  gradient.addColorStop(0.55, def.colors.base);
  gradient.addColorStop(1, def.colors.base);
  ctx.fillStyle = gradient;
  ctx.fillRect(groutPx, groutPx, inner, inner);

  // Subtle speckle so the tile is not a flat colour under a directional light.
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 900; i += 1) {
    const x = groutPx + Math.random() * inner;
    const y = groutPx + Math.random() * inner;
    ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(x, y, 1.5, 1.5);
  }
  ctx.globalAlpha = 1;

  // Bevel highlight on the top/left edge of the tile.
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(groutPx + 1, groutPx + 1, inner - 2, inner - 2);

  ctx.strokeStyle = "rgba(0,0,0,0.10)";
  ctx.lineWidth = 1;
  ctx.strokeRect(groutPx + 3, groutPx + 3, inner - 6, inner - 6);
}

function paintWallCell(ctx: CanvasRenderingContext2D, def: SurfaceMaterialDef): void {
  const size = ctx.canvas.width;
  ctx.fillStyle = def.colors.base;
  ctx.fillRect(0, 0, size, size);

  const gradient = ctx.createLinearGradient(0, 0, 0, size);
  gradient.addColorStop(0, "rgba(255,255,255,0.06)");
  gradient.addColorStop(1, "rgba(0,0,0,0.06)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 1400; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.fillStyle = Math.random() > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.globalAlpha = 1;
}

/** Frees GPU memory for a room that is being deleted. */
export function disposeRoomResources(): void {
  for (const material of materialCache.values()) material.dispose();
  for (const texture of textureCache.values()) texture.dispose();
  materialCache.clear();
  textureCache.clear();
}
