"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ExportGlbButton } from "./ExportGlbButton";
import { InspectorPanel } from "./InspectorPanel";
import { RoomPanel } from "./RoomPanel";
import { useActiveRoom } from "@/lib/store/useFloorPlanStore";
import { useRoomAnalysis } from "@/lib/store/useRoomAnalysis";

const ViewerCanvas = dynamic(() => import("@/components/canvas/ViewerCanvas"), {
  ssr: false,
  loading: () => <CanvasPlaceholder />,
});

export function WorkspaceShell() {
  return (
    <div className="flex h-dvh min-h-dvh flex-col bg-[#060a12] text-slate-200">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#080d18]/90 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="leading-tight">
            <h1 className="text-[13px] font-semibold tracking-wide text-slate-100">Floor Plan 3D Preview</h1>
            <p className="text-[10.5px] text-slate-500">Polygon validation → earcut → quantity takeoff</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ExportGlbButton />
          <Link
            href="/account"
            className="rounded-md border border-white/10 px-3 py-1.5 text-[12px] text-slate-300 transition hover:border-white/25 hover:text-white"
          >
            Account
          </Link>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_350px]">
        <aside className="min-h-0 overflow-y-auto border-b border-white/10 bg-[#080d18] p-3.5 lg:border-b-0 lg:border-r">
          <RoomPanel />
        </aside>

        <ViewerPane />

        <aside className="min-h-0 overflow-y-auto border-t border-white/10 bg-[#080d18] p-3.5 lg:border-t-0 lg:border-l">
          <InspectorPanel />
        </aside>
      </main>
    </div>
  );
}

function ViewerPane() {
  const room = useActiveRoom();
  const analysis = useRoomAnalysis(room);

  return (
    <section className="relative min-h-[440px] bg-[#060a12] lg:min-h-0">
      <ViewerCanvas />

      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1.5">
        <span className="rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[11px] font-medium text-slate-100 backdrop-blur">
          {room.name}
        </span>
        <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/45 px-2 py-1 text-[10px] text-slate-300 backdrop-blur">
          <span className={`h-1.5 w-1.5 rounded-full ${analysis.ok ? "bg-emerald-400" : "bg-rose-400"}`} />
          {analysis.ok ? "validated mesh" : analysis.error.code}
        </span>
      </div>

      {!analysis.ok ? (
        <div className="pointer-events-none absolute inset-x-6 top-1/2 -translate-y-1/2 rounded-lg border border-rose-500/30 bg-[#160a12]/85 p-4 text-center backdrop-blur">
          <p className="text-[12px] font-semibold text-rose-200">Rendering blocked</p>
          <p className="mt-1 text-[11px] leading-4 text-rose-100/70">
            {analysis.error.message}
            <br />
            The 3D layer only accepts geometry that passed triangulation and coverage checks.
          </p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-slate-400 backdrop-blur">
        Drag to orbit · click a surface to select
      </div>
    </section>
  );
}

function CanvasPlaceholder() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#060a12]">
      <span className="text-[11px] tracking-[0.2em] text-slate-600">INITIALIZING WEBGL…</span>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-md border border-amber-300/30 bg-gradient-to-br from-amber-300/20 to-transparent">
      <svg viewBox="0 0 24 24" className="h-4 w-4 text-amber-300" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M3 20V6l9-3 9 3v14" strokeLinejoin="round" />
        <path d="M3 20h18" strokeLinecap="round" />
        <path d="M9 20v-6h6v6" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
