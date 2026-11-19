"use client";

import { useState } from "react";
import { buildExportGroup, downloadBlob, groupToGlb, slugify } from "@/lib/export/glb";
import { useActiveRoom } from "@/lib/store/useFloorPlanStore";
import { useRoomAnalysis } from "@/lib/store/useRoomAnalysis";
import { uploadGlbExport } from "@/lib/supabase/storage";

type ExportState =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "done"; message: string }
  | { status: "error"; message: string };

export function ExportGlbButton() {
  const room = useActiveRoom();
  const analysis = useRoomAnalysis(room);
  const [state, setState] = useState<ExportState>({ status: "idle" });

  const disabled = state.status === "busy" || !analysis.ok;

  async function handleExport() {
    if (!analysis.ok) {
      setState({ status: "error", message: "Geometry is invalid — fix the outline before exporting." });
      return;
    }

    setState({ status: "busy" });
    try {
      const group = buildExportGroup(analysis.plan, {
        roomName: room.name,
        wallHeight: room.wallHeight,
        floorMaterial: room.floorMaterial,
        wallMaterial: room.wallMaterial,
      });
      const blob = await groupToGlb(group);
      const fileName = `${slugify(room.name)}.glb`;
      downloadBlob(blob, fileName);

      const upload = await uploadGlbExport(blob, fileName);
      setState({
        status: "done",
        message: upload.ok ? "GLB downloaded + archived to Supabase" : "GLB downloaded",
      });
    } catch (error) {
      setState({ status: "error", message: (error as Error).message });
    } finally {
      setTimeout(() => setState({ status: "idle" }), 4000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {state.status === "done" || state.status === "error" ? (
        <span
          className={`hidden text-[11px] sm:inline ${
            state.status === "error" ? "text-rose-300" : "text-emerald-300"
          }`}
        >
          {state.message}
        </span>
      ) : null}
      <button
        type="button"
        onClick={handleExport}
        disabled={disabled}
        title={analysis.ok ? "Export the validated mesh as GLB" : "Fix the geometry first"}
        className="rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-[12px] font-medium text-amber-200 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {state.status === "busy" ? "Exporting…" : "Export GLB"}
      </button>
    </div>
  );
}
