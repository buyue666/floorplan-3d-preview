# Floor Plan 3D Preview — MVP

A home-renovation preview tool where the **geometry core is the product**: a floor-plan
polygon goes in, a validated triangulation comes out, and only then does anything reach
the 3D canvas. Areas and material quantities are computed from the polygon itself — no
market pricing, no external services.

> **Scope:** polygon-authored floor plans only. Photo → 3D reconstruction is **roadmap
> only** and is deliberately not implemented here (see [Roadmap](#roadmap)).

---

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | **Next.js 16 (App Router)** + React 19 | Server shell, client-only canvas |
| Styling | **TailwindCSS v4** | No runtime CSS-in-JS |
| 3D | **React Three Fiber 9** + **Drei** | Declarative scene graph, OrbitControls, shadows |
| Geometry | **earcut** + **polygon-clipping** | Fast ear-cutting + Martinez cleanup fallback |
| State | **Zustand 5** | Shape / material / selection store without boilerplate |
| Backend (optional) | **Supabase** (auth, storage) + **FastAPI** stub | Skeleton only, app runs without them |
| Tests | **Vitest** | Node-level tests for the geometry core |

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 20 geometry assertions
npm run typecheck
npm run build
```

Optional Supabase: copy `.env.example` → `.env.local`, fill the two `NEXT_PUBLIC_*`
values, then run `supabase/schema.sql` in the SQL editor. Without them the app still
renders; upload/export-to-cloud paths just report "Supabase is not configured".

Optional FastAPI stub:

```bash
cd backend
python -m venv .venv && .venv/Scripts/activate    # Windows
# source .venv/bin/activate                        # macOS / Linux
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

---

## Why the geometry core is the product

`lib/geometry` is plain TypeScript, has no React or three.js imports, and is the only
module allowed to produce a `ValidatedFloorPlan`. The 3D layer accepts nothing else —
so a broken outline physically cannot become a broken mesh.

```
RawFloorPlan
   │  parse + unit scaling (m / cm / mm / ft)
   ▼
normalize      strip closing point, consecutive duplicates, collinear points
   │
diagnose       duplicate vertex / self-intersection / hole topology / degenerate ring
   │
   ├── clean ──► polygon-clipping union(self) + difference(holes)
   │             then **re-run every check** on the cleaned rings
   ▼
earcut ──► audit: triangle count, area coverage vs shoelace, degenerate triangle ratio
   │
   ▼
ValidatedFloorPlan  (outer CCW, holes CW, metrics, warnings, repair provenance)
```

### Guardrails

| Check | Detects | Outcome |
| --- | --- | --- |
| **Duplicate vertices** | repeated corners, unclosed rings, pinch points | consecutive dups auto-removed (warning); non-adjacent dups → `ERR_DUPLICATE_VERTEX` |
| **Self-intersection** | crossing edges, overlapping collinear edges, spikes | repair attempt; if it still isn't simple → error |
| **Hole topology** | hole outside, touching the outer ring, holes overlapping / nested | hard error (holes are semantic, not "repairable") |
| **Winding order** | CW outer, CCW holes | normalized to **outer CCW / holes CW** with a warning |
| **Degenerate ring** | collinear or zero-area outline | `ERR_DEGENERATE_RING` |
| **Triangulation audit** | earcut returned partial / overlapping triangles | cleanup fallback, then error |

### Why the triangulation is audited, not trusted

`earcut` never throws. On a self-intersecting or degenerate ring it happily returns
*something* — a fan that covers 60 % of the polygon, or a set of zero-area slivers. A
`try/catch` around `earcut()` therefore proves nothing.

So every triangulation is verified against the polygon it claims to cover:

- triangle count vs `n + 2h − 2`
- **sum of triangle areas vs shoelace area** (relative tolerance `2e-3`)
- degenerate-triangle ratio must stay under 25 %
- every index must be in range

Only a result that passes all four reaches the renderer.

### Cleanup fallback (polygon-clipping / Martinez)

`polygon-clipping`'s `union` resolves a self-intersecting ring into simple polygons;
`difference` then subtracts the courtyards. Cleanup is treated as **guilty until proven
innocent**:

1. the cleaned rings are re-normalized and re-checked for simplicity;
2. hole count must survive — a courtyard that "disappears" is an error, never a silent
   bit of lost area;
3. if the outline splits into **multiple disjoint regions**, the default is
   `ERR_MULTIPLE_REGIONS` (a room cannot become two rooms). Callers may opt into
   `onMultipleRegions: "largest"`, which keeps the biggest piece and emits a warning;
4. a footprint change larger than 5 % raises `WARN_AREA_CHANGED_BY_CLEANUP`.

### Error codes

| Code | Meaning |
| --- | --- |
| `ERR_INPUT_EMPTY` | no ring, or a vertex is not a number pair |
| `ERR_TOO_FEW_POINTS` | fewer than 3 distinct corners |
| `ERR_DUPLICATE_VERTEX` | the ring revisits a point (pinch) |
| `ERR_DEGENERATE_RING` | collinear / zero-area outline |
| `ERR_SELF_INTERSECTION` | ring is not simple |
| `ERR_HOLE_OUTSIDE` | courtyard vertex outside the outline |
| `ERR_HOLE_TOUCHES_OUTER` | courtyard touches the outer wall |
| `ERR_HOLE_OVERLAP` | courtyards overlap or nest |
| `ERR_MULTIPLE_REGIONS` | cleanup split the shape into disjoint pieces |
| `ERR_CLEAN_FAILED` | cleanup produced nothing usable (or dropped a hole) |
| `ERR_TRIANGULATION_FAILED` | earcut still fails after cleanup |

Every error carries a human `message`, an actionable `hint`, and a `detail` object for
debugging. The UI shows the error card **instead of** the mesh.

---

## Quantity takeoff (no pricing)

All numbers are derived from the validated polygon, in metres:

```
floor area   = outer area − Σ hole areas          (shoelace)
outer wall   = outer perimeter × wall height
inner wall   = Σ hole perimeters × wall height     ← a courtyard has walls too
wall area    = total perimeter × wall height
tiles        = ceil(floor area × (1 + waste%) / tile area)
paint        = wall area × coats / coverage (m² per litre)
```

Tile format (600×600), waste (10 %), paint coverage (10 m²/L) and coats (2) are
**specification constants** in `DEFAULT_QUANTITIES` — editable, but they are material
assumptions, **not market prices**. Nothing in this repo fetches prices, FX rates or
supplier data. `metrics.quantities` only ever contains `tiles`, `paintLitres`,
`paintBuckets5L`, `paintBuckets15L` (asserted by a test).

---

## 3D layer

- **Floor** — built directly from the audited triangulation, `+Y` normals enforced,
  world-space UVs in metres (`uv = (x, z)`).
- **Walls** — one thin box per polygon edge, *including hole edges*, so reflex corners
  and courtyards need no polygon offset. Corner boxes are lengthened by the wall
  thickness to close the notch. Wall thickness is visual only; it is not subtracted from
  the area numbers.
- **Textures** — `CanvasTexture` generated at runtime (tile cell with grout + speckle,
  paint with subtle variance), so there are **no binary assets and no network fetches**.
  `texture.repeat = 1 / tileSize` because UVs are metric: a 600 mm tile is 600 mm on a
  2 m wall and on a 10 m wall alike.
- **Material swap** — per-surface (floor / wall) from the inspector; both tile and paint
  formats are selectable on either surface.
- **Selection** — click a floor or a wall panel; the selection lives in Zustand and
  drives the amber outline. Clicking empty space clears it.
- **GLB export** — the export group is rebuilt from the validated plan rather than cloned
  from the live scene, so grid / contact-shadow helpers can never leak into the file.

---

## State (Zustand)

`lib/store/useFloorPlanStore.ts` holds **only inputs**: `rooms[]` (plan, units, wall
height, floor material, wall material), `activeRoomId`, `selection`, `revision`.
Derived geometry is never stored — `useRoomAnalysis` recomputes it with `useMemo`, so a
cached mesh can never drift from the shape it claims to represent.

---

## Supabase (skeleton)

| Piece | Where |
| --- | --- |
| Browser client + graceful no-op | `lib/supabase/client.ts`, `config.ts` |
| Image upload / GLB archive / plan rows | `lib/supabase/storage.ts` |
| Tables, RLS, buckets, triggers | `supabase/schema.sql` |
| Magic-link auth screen | `app/account/page.tsx` |

Buckets: `floorplan-images` (public read, authenticated write) and `glb-exports`.
Table `floor_plans` stores `geometry` + `metrics` as JSONB per user.

Not included: server-side session cookies (`@supabase/ssr`) and middleware refresh —
that lands with real persistence, not in the skeleton.

---

## FastAPI stub (optional)

`backend/main.py` pins the future contract and answers **501** everywhere it would need
to do work:

- `GET /health` → `{ status, reconstruction_enabled: false }`
- `GET /api/v1/capabilities` → lets the client hide the "auto-trace" button
- `POST /api/v1/reconstruct` → 501 with the planned request/response shape
- `POST /api/v1/reconstruct/upload` → 501 (multipart flavour)

The Next.js app does not call it; it exists so the reconstruction milestone has a
contract to implement against.

---

## Project structure

```
app/
  page.tsx                  workspace shell (client)
  account/page.tsx          Supabase auth skeleton
  globals.css
components/
  canvas/ViewerCanvas.tsx   R3F canvas, camera rig, floor + wall meshes
  workspace/                RoomPanel (outline editor) · InspectorPanel (takeoff)
                            ExportGlbButton · WorkspaceShell
lib/
  geometry/                 ★ core: types, vec, validate, clean, triangulate, metrics, index
    index.test.ts           20 assertions (guardrails, winding, repair, quantities)
    fixtures.ts             presets shared by UI + tests
  store/                    Zustand store + derived analysis hook
  three/                    plan → THREE geometry (floor, wall boxes, metric UVs)
  materials/surfaces.ts     runtime canvas textures + material cache
  export/glb.ts             export group + GLTFExporter
  supabase/                 client, config, storage helpers
  workspace/planText.ts     "x, y" text ⇄ RawFloorPlan
backend/main.py             FastAPI stub (501)
supabase/schema.sql         tables, RLS, buckets
```

---

## Known edge cases & limitations

**Geometry**

- **Self-intersection** — a symmetric bowtie has *zero signed area*, so it is diagnosed
  as a crossing (not as "degenerate"); cleanup then usually splits it into two 4 m²
  triangles → `ERR_MULTIPLE_REGIONS`. This is intentional: better a clear error than a
  room that silently became two.
- **Hole winding** — outer must be CCW and holes CW for three.js `Shape`; the normalizer
  handles both directions and reports each flip. A hole touching the outer ring is
  rejected rather than merged, because merging would quietly delete a wall.
- **Pinch points** — a ring that revisits a vertex is a topological pinch, not a
  duplicate-key problem; it is rejected with `ERR_DUPLICATE_VERTEX`.
- **Multipolygons** — cleanup can legitimately produce several regions; the default
  rejects them, `onMultipleRegions: "largest"` keeps the biggest with a warning.
- **Units** — coordinates are read in the selected unit; switching units *reinterprets*
  the numbers (it does not rescale them). Author in the unit you drew in.
- **Wall corners** overlap slightly at the joints (boxes are lengthened by the thickness).
  A true miter/bevel offset is roadmap — offsets are their own self-intersection problem
  on narrow rooms and reflex corners.
- **Wall thickness is cosmetic**: it never changes area or perimeter numbers.

**Product**

- No doors/windows, no multi-floor, no furniture, no room splitting.
- One active room is rendered at a time (the room list stores many).
- No persistence beyond session state + optional Supabase upload.
- Quantities are estimates under declared assumptions, not a bill of materials.
- **No photo → 3D reconstruction.** Not implemented anywhere in this repo.

---

## MVP scope

In: polygon validation + triangulation guardrails, cleanup fallback, hole support,
frontend-only metrics, 3D preview, material swap, Zustand state, Supabase/GLB skeleton,
FastAPI stub, README, tests.

Out: reconstruction, pricing, doors/windows, multi-floor, server-side geometry.

---

## Roadmap

1. **Photo → 3D reconstruction** (the big one): raster → vector outline extraction,
   wall thickness inference, courtyard detection, confidence score, then the *same*
   validator on the returned polygon. The FastAPI contract in `backend/` is the seam.
2. Mitered wall offsets with a narrow-room guard.
3. Door / window openings as sub-segments with their own area deductions.
4. Server-side persistence (`@supabase/ssr` + middleware) and shareable project links.
5. Multi-room layout with per-room transforms, drag-to-edit vertices on the canvas.
