import { useMemo } from "react";
import { analyzeFloorPlan } from "@/lib/geometry";
import type { PlanAnalysis } from "@/lib/geometry/types";
import type { RoomDraft } from "./useFloorPlanStore";

/**
 * Analysis is pure and cheap, so it is derived on the fly instead of being
 * cached in the store — a stored result could drift from the stored shape.
 */
export function useRoomAnalysis(room: RoomDraft): PlanAnalysis {
  return useMemo(
    () => analyzeFloorPlan(room.plan, { units: room.units, wallHeight: room.wallHeight }),
    [room.plan, room.units, room.wallHeight],
  );
}
