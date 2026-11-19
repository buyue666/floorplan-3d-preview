"use client";

import { create } from "zustand";
import { PLAN_PRESETS } from "@/lib/geometry/fixtures";
import type { LengthUnit, RawFloorPlan } from "@/lib/geometry/types";
import type { SurfaceMaterialId } from "@/lib/materials/surfaces";

export type Surface = "floor" | "wall";

export interface Selection {
  roomId: string;
  surface: Surface;
  /** Only set for wall selections. */
  wallKey?: string;
}

export interface RoomDraft {
  id: string;
  name: string;
  plan: RawFloorPlan;
  units: LengthUnit;
  wallHeight: number;
  floorMaterial: SurfaceMaterialId;
  wallMaterial: SurfaceMaterialId;
}

export interface FloorPlanStore {
  rooms: RoomDraft[];
  activeRoomId: string;
  selection: Selection | null;
  /** Bumped whenever a room is committed, used to re-frame the camera. */
  revision: number;
  setActiveRoom: (id: string) => void;
  updateRoomPlan: (id: string, plan: RawFloorPlan) => void;
  updateRoom: (id: string, patch: Partial<Omit<RoomDraft, "id">>) => void;
  addRoom: () => void;
  duplicateRoom: (id: string) => void;
  removeRoom: (id: string) => void;
  select: (selection: Selection | null) => void;
}

function clonePlan(plan: RawFloorPlan): RawFloorPlan {
  return {
    outer: plan.outer.map(([x, y]) => [x, y] as [number, number]),
    holes: (plan.holes ?? []).map((hole) => hole.map(([x, y]) => [x, y] as [number, number])),
  };
}

const initialPlan = PLAN_PRESETS.find((preset) => preset.id === "l-shaped-living")!;

let roomCounter = 1;

export const useFloorPlanStore = create<FloorPlanStore>()((set, get) => ({
  rooms: [
    {
      id: "room-1",
      name: "Living room",
      plan: clonePlan(initialPlan.plan),
      units: "m",
      wallHeight: 2.8,
      floorMaterial: "tile-porcelain",
      wallMaterial: "paint-warm-white",
    },
  ],
  activeRoomId: "room-1",
  selection: null,
  revision: 0,

  setActiveRoom: (id) =>
    set((state) => (state.activeRoomId === id ? state : { activeRoomId: id, selection: null })),

  updateRoomPlan: (id, plan) =>
    set((state) => ({
      rooms: state.rooms.map((room) => (room.id === id ? { ...room, plan: clonePlan(plan) } : room)),
      revision: state.revision + 1,
    })),

  updateRoom: (id, patch) =>
    set((state) => ({
      rooms: state.rooms.map((room) => (room.id === id ? { ...room, ...patch } : room)),
      revision: state.revision + 1,
    })),

  addRoom: () => {
    roomCounter += 1;
    const id = `room-${Date.now()}-${roomCounter}`;
    const template = get().rooms.find((room) => room.id === get().activeRoomId) ?? get().rooms[0];
    set((state) => ({
      rooms: [
        ...state.rooms,
        {
          id,
          name: `Room ${state.rooms.length + 1}`,
          plan: clonePlan(template.plan),
          units: template.units,
          wallHeight: template.wallHeight,
          floorMaterial: template.floorMaterial,
          wallMaterial: template.wallMaterial,
        },
      ],
      activeRoomId: id,
      selection: null,
    }));
  },

  duplicateRoom: (id) => {
    const source = get().rooms.find((room) => room.id === id);
    if (!source) return;
    roomCounter += 1;
    const newId = `${source.id}-copy-${roomCounter}`;
    set((state) => ({
      rooms: [...state.rooms, { ...source, id: newId, name: `${source.name} copy`, plan: clonePlan(source.plan) }],
      activeRoomId: newId,
      selection: null,
    }));
  },

  removeRoom: (id) =>
    set((state) => {
      if (state.rooms.length <= 1) return state;
      const rooms = state.rooms.filter((room) => room.id !== id);
      return {
        rooms,
        activeRoomId: state.activeRoomId === id ? rooms[0].id : state.activeRoomId,
        selection: state.selection?.roomId === id ? null : state.selection,
      };
    }),

  select: (selection) => set({ selection }),
}));

export function useActiveRoom(): RoomDraft {
  return useFloorPlanStore((state) => state.rooms.find((room) => room.id === state.activeRoomId) ?? state.rooms[0]);
}

export function useActiveAnalysis() {
  const room = useActiveRoom();
  return { room };
}
