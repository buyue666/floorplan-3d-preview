import type { RawFloorPlan } from "@/lib/geometry/types";

export interface ParseSuccess {
  ok: true;
  plan: RawFloorPlan;
  holes: number;
}

export interface ParseFailure {
  ok: false;
  message: string;
  line?: number;
}

/**
 * Text format: the first block of "x, y" lines is the outer ring, every
 * following block (separated by a blank line) is a hole.
 */
export function parsePlanText(text: string): ParseSuccess | ParseFailure {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  if (blocks.length === 0) {
    return { ok: false, message: "No coordinates yet — add at least three “x, y” lines." };
  }

  const rings: Array<[number, number][]> = [];

  for (let b = 0; b < blocks.length; b += 1) {
    const lines = blocks[b]
      .split("\n")
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.trim().length > 0);

    const ring: Array<[number, number]> = [];
    for (const { line, index } of lines) {
      const trimmed = line.trim().replace(/,/g, " ").replace(/\s+/g, " ");
      const parts = trimmed.split(" ");
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      if (parts.length < 2 || !Number.isFinite(x) || !Number.isFinite(y)) {
        return {
          ok: false,
          message: `“${line.trim()}” is not an “x, y” pair (${b === 0 ? "outer ring" : `hole #${b}`}).`,
          line: index + 1,
        };
      }
      ring.push([x, y]);
    }

    if (ring.length > 0) rings.push(ring);
  }

  if (rings.length === 0) {
    return { ok: false, message: "No valid rings parsed." };
  }

  return {
    ok: true,
    plan: {
      outer: rings[0],
      holes: rings.slice(1),
    },
    holes: rings.length - 1,
  };
}

export function formatPlanText(plan: RawFloorPlan): string {
  const ring = (points: Array<[number, number] | number[]>) =>
    points.map(([x, y]) => `${trim(x)}, ${trim(y)}`).join("\n");

  const parts = [ring(plan.outer)];
  for (const hole of plan.holes ?? []) parts.push(ring(hole));
  return parts.join("\n\n");
}

function trim(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}
