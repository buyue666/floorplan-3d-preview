"use client";

import { SURFACE_MATERIALS, type SurfaceMaterialId } from "@/lib/materials/surfaces";
import type { PlanMetrics, GeometryWarning } from "@/lib/geometry/types";
import { useActiveRoom, useFloorPlanStore } from "@/lib/store/useFloorPlanStore";
import { useRoomAnalysis } from "@/lib/store/useRoomAnalysis";

export function InspectorPanel() {
  const room = useActiveRoom();
  const analysis = useRoomAnalysis(room);
  const updateRoom = useFloorPlanStore((state) => state.updateRoom);
  const selection = useFloorPlanStore((state) => state.selection);

  return (
    <div className="space-y-4">
      {analysis.ok ? (
        <StatusCard
          source={analysis.plan.geometrySource}
          triangleCount={analysis.plan.triangulation.triangleCount}
          deviation={analysis.plan.triangulation.deviation}
        />
      ) : (
        <ErrorCard code={analysis.error.code} message={analysis.error.message} hint={analysis.error.hint} />
      )}

      {selection ? (
        <div className="flex items-center gap-2 rounded-md border border-amber-300/25 bg-amber-300/[0.06] px-2.5 py-1.5 text-[11px] text-amber-200">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
          Selected: <span className="font-medium">{selection.surface}</span>
          {selection.wallKey ? <span className="text-amber-200/60">({selection.wallKey})</span> : null}
        </div>
      ) : null}

      {analysis.ok ? <MetricsCard metrics={analysis.plan.metrics} /> : null}

      {analysis.ok ? (
        <section className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Wall height</h3>
            <span className="font-mono text-[12px] text-amber-200">{room.wallHeight.toFixed(2)} m</span>
          </div>
          <input
            type="range"
            min={2}
            max={4}
            step={0.05}
            value={room.wallHeight}
            onChange={(event) => updateRoom(room.id, { wallHeight: Number(event.target.value) })}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-400"
          />
          <p className="mt-2 text-[10.5px] text-slate-500">
            Wall area is derived, never hard-coded: total perimeter × height.
          </p>
        </section>
      ) : null}

      {analysis.ok ? <QuantitiesCard metrics={analysis.plan.metrics} /> : null}

      <MaterialCard
        title="Floor material"
        value={room.floorMaterial}
        onChange={(id) => updateRoom(room.id, { floorMaterial: id })}
      />
      <MaterialCard
        title="Wall material"
        value={room.wallMaterial}
        onChange={(id) => updateRoom(room.id, { wallMaterial: id })}
      />

      {analysis.warnings.length > 0 ? <WarningsCard warnings={analysis.warnings} /> : null}
    </div>
  );
}

function StatusCard({ source, triangleCount, deviation }: { source: string; triangleCount: number; deviation: number }) {
  return (
    <section className="rounded-lg border border-emerald-400/25 bg-emerald-400/[0.06] p-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <h3 className="text-[12px] font-semibold text-emerald-200">Geometry validated</h3>
        <span className="ml-auto rounded bg-emerald-400/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
          {source}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] text-emerald-100/70">
        {triangleCount} triangles · area deviation {(deviation * 100).toFixed(3)}%
      </p>
    </section>
  );
}

function ErrorCard({ code, message, hint }: { code: string; message: string; hint?: string }) {
  return (
    <section className="rounded-lg border border-rose-500/35 bg-rose-500/[0.08] p-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-rose-400" />
        <h3 className="text-[12px] font-semibold text-rose-200">Mesh suppressed</h3>
        <span className="ml-auto rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[9.5px] text-rose-200">{code}</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-4 text-rose-100/85">{message}</p>
      {hint ? <p className="mt-1.5 text-[11px] leading-4 text-rose-200/60">{hint}</p> : null}
    </section>
  );
}

function MetricsCard({ metrics }: { metrics: PlanMetrics }) {
  return (
    <section className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Takeoff</h3>
      <dl className="space-y-1">
        <Row label="Floor area" value={`${metrics.floorArea.toFixed(2)} m²`} strong />
        <Row label="Gross outer area" value={`${metrics.outerArea.toFixed(2)} m²`} />
        <Row label="Holes area" value={`${metrics.holesArea.toFixed(2)} m²`} />
        <div className="my-1.5 h-px bg-white/8" />
        <Row label="Outer perimeter" value={`${metrics.outerPerimeter.toFixed(2)} m`} />
        <Row label="Hole perimeter" value={`${metrics.holesPerimeter.toFixed(2)} m`} />
        <Row label="Total wall run" value={`${metrics.totalPerimeter.toFixed(2)} m`} />
        <div className="my-1.5 h-px bg-white/8" />
        <Row label="Wall area" value={`${metrics.wallArea.toFixed(2)} m²`} strong />
        <Row label="Outer walls" value={`${metrics.outerWallArea.toFixed(2)} m²`} />
        <Row label="Courtyard walls" value={`${metrics.innerWallArea.toFixed(2)} m²`} />
      </dl>
    </section>
  );
}

function QuantitiesCard({ metrics }: { metrics: PlanMetrics }) {
  return (
    <section className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Quantities</h3>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border border-white/8 bg-slate-950/50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Tiles 600×600</div>
          <div className="mt-1 font-mono text-[19px] leading-none text-slate-100">{metrics.quantities.tiles}</div>
          <div className="mt-1 text-[10px] text-slate-500">incl. 10% waste</div>
        </div>
        <div className="rounded-md border border-white/8 bg-slate-950/50 p-2.5">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Paint (2 coats)</div>
          <div className="mt-1 font-mono text-[19px] leading-none text-slate-100">
            {metrics.quantities.paintLitres}
            <span className="ml-1 text-[11px] text-slate-400">L</span>
          </div>
          <div className="mt-1 text-[10px] text-slate-500">
            {metrics.quantities.paintBuckets15L} × 15 L buckets
          </div>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-slate-500">
        Quantities only — no pricing or market data is fetched anywhere in this MVP.
      </p>
    </section>
  );
}

function MaterialCard({
  title,
  value,
  onChange,
}: {
  title: string;
  value: SurfaceMaterialId;
  onChange: (id: SurfaceMaterialId) => void;
}) {
  return (
    <section className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{title}</h3>
      <div className="grid grid-cols-3 gap-1.5">
        {SURFACE_MATERIALS.map((material) => {
          const active = material.id === value;
          return (
            <button
              key={material.id}
              type="button"
              onClick={() => onChange(material.id)}
              className={`rounded border p-1 text-left transition ${
                active ? "border-amber-300/60 bg-amber-300/10" : "border-white/10 hover:border-white/25"
              }`}
            >
              <span
                className="block h-7 w-full rounded-sm"
                style={{ backgroundColor: material.swatch }}
                aria-hidden
              />
              <span className="mt-1 block truncate text-[9.5px] leading-none text-slate-300">{material.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function WarningsCard({ warnings }: { warnings: GeometryWarning[] }) {
  return (
    <section className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] p-3">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-200/80">
        Warnings ({warnings.length})
      </h3>
      <ul className="space-y-1">
        {warnings.map((warning, index) => (
          <li key={`${warning.code}-${index}`} className="text-[10.5px] leading-4 text-amber-100/70">
            <span className="mr-1 rounded bg-amber-400/15 px-1 py-0.5 font-mono text-[9px] text-amber-200/90">
              {warning.code.replace("WARN_", "")}
            </span>
            {warning.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className={`font-mono text-[12px] tabular-nums ${strong ? "text-amber-200" : "text-slate-200"}`}>{value}</dd>
    </div>
  );
}
