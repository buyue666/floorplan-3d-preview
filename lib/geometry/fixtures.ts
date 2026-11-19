import type { RawFloorPlan } from "./types";

export interface PlanPreset {
  id: string;
  name: string;
  description: string;
  units: "m" | "cm" | "mm" | "ft";
  plan: RawFloorPlan;
}

/**
 * Fixtures double as UI presets and as regression cases for the geometry tests.
 * Every "broken" preset here is a shape a real user can produce by hand.
 */
export const PLAN_PRESETS: PlanPreset[] = [
  {
    id: "studio",
    name: "Studio 5×4 m",
    description: "Plain rectangle, outer ring counter-clockwise.",
    units: "m",
    plan: {
      outer: [
        [0, 0],
        [5, 0],
        [5, 4],
        [0, 4],
      ],
    },
  },
  {
    id: "l-shaped-living",
    name: "L-shaped living room",
    description: "Reflex corner — the classic case a naive fan triangulation breaks on.",
    units: "m",
    plan: {
      outer: [
        [0, 0],
        [6, 0],
        [6, 4],
        [3, 4],
        [3, 7],
        [0, 7],
      ],
    },
  },
  {
    id: "courtyard-villa",
    name: "Villa with inner courtyard",
    description: "10×8 m outline with a 3×2.5 m courtyard hole (clockwise ring).",
    units: "m",
    plan: {
      outer: [
        [0, 0],
        [10, 0],
        [10, 8],
        [0, 8],
      ],
      holes: [
        [
          [3, 2],
          [3, 4.5],
          [6, 4.5],
          [6, 2],
        ],
      ],
    },
  },
  {
    id: "millimetres",
    name: "Millimetre input",
    description: "Same 5×4 m room authored in millimetres — the unit switch must not change the metrics.",
    units: "mm",
    plan: {
      outer: [
        [0, 0],
        [5000, 0],
        [5000, 4000],
        [0, 4000],
      ],
    },
  },
  {
    id: "clockwise",
    name: "Clockwise outline + CCW hole",
    description: "Both rings wound the wrong way; the normalizer must flip them and say so.",
    units: "m",
    plan: {
      outer: [
        [0, 0],
        [0, 6],
        [8, 6],
        [8, 0],
      ],
      holes: [
        [
          [2, 2],
          [5, 2],
          [5, 4],
          [2, 4],
        ],
      ],
    },
  },
  {
    id: "duplicate-vertices",
    name: "Duplicate vertices (repairable)",
    description: "Repeated corners plus a closing point — cleaned automatically with warnings.",
    units: "m",
    plan: {
      outer: [
        [0, 0],
        [5, 0],
        [5, 0],
        [5, 3],
        [0, 3],
        [0, 0],
      ],
    },
  },
  {
    id: "bowtie",
    name: "Self-intersecting bowtie (broken)",
    description: "Edges cross in the middle. Cleanup splits it into two regions, so it must be rejected.",
    units: "m",
    plan: {
      outer: [
        [0, 0],
        [4, 4],
        [4, 0],
        [0, 4],
      ],
    },
  },
  {
    id: "hole-outside",
    name: "Hole outside the outline (broken)",
    description: "A courtyard drawn outside the room — must surface ERR_HOLE_OUTSIDE, not a mesh.",
    units: "m",
    plan: {
      outer: [
        [0, 0],
        [8, 0],
        [8, 6],
        [0, 6],
      ],
      holes: [
        [
          [9, 1],
          [9, 2],
          [10, 2],
          [10, 1],
        ],
      ],
    },
  },
];

export function getPreset(id: string): PlanPreset | undefined {
  return PLAN_PRESETS.find((preset) => preset.id === id);
}
