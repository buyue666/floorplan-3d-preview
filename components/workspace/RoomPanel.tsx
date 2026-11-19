"use client";

import { useEffect, useRef, useState } from "react";
import { analyzeFloorPlan } from "@/lib/geometry";
import { PLAN_PRESETS, getPreset } from "@/lib/geometry/fixtures";
import type { LengthUnit } from "@/lib/geometry/types";
import { useFloorPlanStore, type RoomDraft } from "@/lib/store/useFloorPlanStore";
import { formatPlanText, parsePlanText } from "@/lib/workspace/planText";

const UNITS: Array<{ value: LengthUnit; label: string }> = [
  { value: "m", label: "metres" },
  { value: "cm", label: "centimetres" },
  { value: "mm", label: "millimetres" },
  { value: "ft", label: "feet" },
];

export function RoomPanel() {
  const rooms = useFloorPlanStore((state) => state.rooms);
  const activeRoomId = useFloorPlanStore((state) => state.activeRoomId);
  const setActiveRoom = useFloorPlanStore((state) => state.setActiveRoom);
  const addRoom = useFloorPlanStore((state) => state.addRoom);
  const duplicateRoom = useFloorPlanStore((state) => state.duplicateRoom);
  const removeRoom = useFloorPlanStore((state) => state.removeRoom);

  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? rooms[0];

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Rooms</h2>
          <button
            type="button"
            onClick={addRoom}
            className="rounded border border-white/10 px-2 py-1 text-[11px] text-slate-300 transition hover:border-amber-300/40 hover:text-amber-200"
          >
            + Add
          </button>
        </div>

        <ul className="space-y-1.5">
          {rooms.map((room) => {
            const result = analyzeFloorPlan(room.plan, { units: room.units, wallHeight: room.wallHeight });
            const active = room.id === activeRoomId;
            return (
              <li key={room.id}>
                <div
                  className={`group flex items-center gap-2 rounded-md border px-2.5 py-2 transition ${
                    active
                      ? "border-amber-300/40 bg-amber-300/[0.07]"
                      : "border-white/8 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setActiveRoom(room.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-200">{room.name}</span>
                    {result.ok ? (
                      <span className="shrink-0 text-[11px] tabular-nums text-slate-400">
                        {result.plan.metrics.floorArea.toFixed(1)} m²
                      </span>
                    ) : (
                      <span className="shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">
                        invalid
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    title="Duplicate room"
                    onClick={() => duplicateRoom(room.id)}
                    className="shrink-0 rounded px-1 text-[11px] text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-slate-200"
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    title="Delete room"
                    disabled={rooms.length <= 1}
                    onClick={() => removeRoom(room.id)}
                    className="shrink-0 rounded px-1 text-[11px] text-slate-500 opacity-0 transition group-hover:opacity-100 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-0"
                  >
                    ✕
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <PolygonEditor room={activeRoom} />
    </div>
  );
}

function PolygonEditor({ room }: { room: RoomDraft }) {
  const updateRoomPlan = useFloorPlanStore((state) => state.updateRoomPlan);
  const updateRoom = useFloorPlanStore((state) => state.updateRoom);

  const [text, setText] = useState(() => formatPlanText(room.plan));
  const [parseError, setParseError] = useState<string | null>(null);
  const lastCommitted = useRef(formatPlanText(room.plan));

  // Pull in external edits (preset applied, room switched, room duplicated).
  useEffect(() => {
    const formatted = formatPlanText(room.plan);
    if (formatted !== lastCommitted.current) {
      lastCommitted.current = formatted;
      setText(formatted);
      setParseError(null);
    }
  }, [room.id, room.plan]);

  // Debounced commit: typing stays responsive, the mesh follows ~300 ms later.
  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parsePlanText(text);
      if (!parsed.ok) {
        setParseError(parsed.message);
        return;
      }
      setParseError(null);
      const formatted = formatPlanText(parsed.plan);
      if (formatted === lastCommitted.current) return;
      lastCommitted.current = formatted;
      updateRoomPlan(room.id, parsed.plan);
    }, 300);
    return () => clearTimeout(timer);
  }, [text, room.id, updateRoomPlan]);

  function applyPreset(id: string) {
    const preset = getPreset(id);
    if (!preset) return;
    lastCommitted.current = formatPlanText(preset.plan);
    setText(lastCommitted.current);
    setParseError(null);
    updateRoom(room.id, { plan: preset.plan, units: preset.units, name: preset.name });
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Outline</h2>
        <select
          value={room.units}
          onChange={(event) => updateRoom(room.id, { units: event.target.value as LengthUnit })}
          className="rounded border border-white/10 bg-slate-900/80 px-1.5 py-1 text-[11px] text-slate-300 outline-none focus:border-amber-300/50"
        >
          {UNITS.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {unit.label}
            </option>
          ))}
        </select>
      </div>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        spellCheck={false}
        rows={12}
        className="w-full resize-y rounded-md border border-white/10 bg-slate-950/70 p-2.5 font-mono text-[12px] leading-5 text-slate-200 outline-none transition focus:border-amber-300/40"
      />

      <p className="text-[10.5px] leading-4 text-slate-500">
        One <span className="text-slate-300">x, y</span> pair per line in the selected unit. A blank line starts a hole
        (inner courtyard) — holes must sit strictly inside the outline.
      </p>

      {parseError ? (
        <p className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-200">
          {parseError}
        </p>
      ) : null}

      <div>
        <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Presets</h3>
        <div className="flex flex-wrap gap-1.5">
          {PLAN_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              onClick={() => applyPreset(preset.id)}
              className="rounded border border-white/10 bg-white/[0.02] px-2 py-1 text-[10.5px] text-slate-300 transition hover:border-amber-300/40 hover:text-amber-200"
            >
              {preset.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
