# webcad — CONSTRUCT / Reference Geometry: CURRENT Behavior

Read-code-only inventory of construction/reference geometry. To be diffed against a Fusion 360 CONSTRUCT spec.
Anchors are `file:line`. Files: `src/store.ts`, `src/worker/cad.worker.ts`, `src/components/Viewport.tsx`, `src/components/SketchLayer.tsx`, `src/ribbon.ts`.

---

## Architecture at a glance (who is / isn't a timeline feature)

- **Construction PLANES = real timeline features.** Every plane-creation path funnels through `addDatumFeature(def, msg)` (`store.ts:4613`), which appends a `datum` Feature and calls `applyFeatures`. The worker treats `datum` as a **zero-geometry SKIP** (`cad.worker.ts:4022`, type decl `cad.worker.ts:86`). `planes[]` is **derived** from un-suppressed datum features via `planesFromFeatures(feats, sup)` (`store.ts:9043`, helpers `datumFeatureFromPlane` `store.ts:2328`, `planeFromDatumFeature` `store.ts:2339`). So planes are replayable / editable / suppressible / deletable / undoable (GM-W5 5.1). Legacy docs are migrated (`migrateDatumFeatures` `store.ts:2367`).
- **Construction AXES (`caxes`) and POINTS (`cpoints`) are NOT timeline features.** They are plain state arrays (`store.ts:4580-4582`), captured in the undo snapshot (`docSnap` `store.ts:2294`) and saved to the doc (`store.ts:16515`, loaders `store.ts:14180/14278`). No worker replay, no marker/rollback position.
- **`ccurves` (intersection curves)** = saved state array of 3D polylines (`store.ts:1053`, `4582`), recomputed on demand.
- PlaneDef shape (the derived `planes[]` element): `{ base:'XY'|'XZ'|'YZ'; offset; angle?; aaxis?:'x'|'y'; arb?:{o,xd,n}; src?; stale? }`. Datum feature carries the same fields (`store.ts:2326`, `cad.worker.ts:86`).

---

## 1. 构造平面 (Construction Planes)

Ribbon CONSTRUCT group lists them explicitly (`ribbon.ts:88-104`). Dispatch: `store.ts:9635-9647`. Dialog UI: `Viewport.tsx:5261-5276` (`plane` featDlg).

| Fusion method | webcad? | Entry / anchor | Fields | Output basis |
|---|---|---|---|---|
| **Offset Plane** (from origin plane) | ✅ | `offsetplane`→`openFeatDlg('plane')`; `addPlane` `store.ts:4602` | base XY/XZ/YZ + offset(mm) | cardinal |
| **Plane at Angle** (rotate base plane) | ✅ | same dialog, `addAnglePlane` `store.ts:4609`; `Viewport.tsx:5265-5266` | offset + angle(±89°) + aaxis (in-plane x/y) | arb via `deriveAngleArb` |
| **Plane at Angle through an edge** | ✅ | `planeangedge`→`startEdgePointPick('angleplane')`→`edgePointAt` `store.ts:11713-11729` | pick edge + angle prompt; plane CONTAINS edge, rotates about edge (Rodrigues) | arb |
| **Midplane** (auto, body center) | ✅ | `plane` dialog base = `midXY/midXZ/midYZ` `store.ts:11860-11866`; `Viewport.tsx:5262` | none (auto min/max mid of body) | cardinal |
| **Midplane** (between 2 parallel faces) | ✅ | `planemid`→`startDatumPick('midplane')`→`applyDatumPick` `store.ts:11651-11673` | pick 2 parallel planar faces | cardinal if axis-aligned, else arb |
| **Plane Through 3 Points** | ✅ | `plane3pt`/三点面→`addPlane3Points` `store.ts:11777-11790` | uses **LAST 3 `cpoints`** | arb (o=pa, xd=pa→pb, n=cross) |
| **Tangent Plane** | ⚠️ cylinder-only | `planetan`→`startDatumPick('tanplane')`→`applyDatumPick` `store.ts:11608-11624` | pick **cylindrical** face; tangent at click side, n=radial | arb + `src{tanPlane}` |
| **Offset from a Face** (any planar face, incl. slanted) | ✅ | `planeoffface`→`startDatumPick('offsetface')` `store.ts:11532-11556` | pick planar face + distance prompt | cardinal or arb, + `src{faceOffset}` |
| **Offset Plane to Point** (parallel-through-point) | ✅ | `planeparpt`→`startDatumPick('parplanept')` `store.ts:11560-11584` | pick planar face + uses **LAST `cpoint`** (no distance) | cardinal(≥0.99995) or arb |
| **Plane Along Path** | ✅ | `planepath`→`startEdgePointPick('pathplane')`→`edgePointAt` `store.ts:11732-11749` | pick edge + ratio(0-1)/`Nmm`; plane ⊥ edge tangent | arb |

Pick plumbing: `datumPick` state + `startDatumPick(kind)` `store.ts:11523`, applied when a face is clicked in Viewport (`Viewport.tsx:581`→`applyDatumPick`). Edge-based picks use `edgePtPick` + `startEdgePointPick` `store.ts:11677`, applied at `Viewport.tsx:588`→`edgePointAt`. ESC cancels (`App.tsx:157`).

**Sketching on a datum:** `sketchOnDatumPlane(base, offset)` `store.ts:4655` (cardinal) / `sketchOnAngleDatum(arb)` `store.ts:4635` (arb). Worker builds arb sketches on `new RPlane(o,xd,n)` (`cad.worker.ts:1571-1590`).

**Associativity — Datum v1 + v2 (#11):**
- **v1 (src-bearing datums follow source):** `rederiveDatums()` `store.ts:4463` runs after every successful forward rebuild (`store.ts:9977-9979`). Datums carrying `src` (`faceOffset`, `tanPlane`) are re-matched to the nearest parallel face/cylinder and moved with it; if the source vanishes → honest `stale:true` (yellow, geometry frozen). Re-derived defs are silently written back to the datum features via `writeBackDatumDefs` `store.ts:2373` (no undo/rebuild) so save/replay stays consistent.
- **v2 (#11 — sketch on datum follows datum):** `sketchOnDatumPlane` captures the associative datum signature into `_pendingDatumRef` `store.ts:82,4659`, committed to `sketchSource.datumRef`. When the datum later moves, `_rebakeDatumSketches` `store.ts:89` re-bakes the sketch's `baseZ` **and** dependent extrude `baseZ`, then does a guarded 2nd rebuild pass (`store.ts:9982-9987`). **Scope limit:** only **cardinal** datum-plane sketches; angle/arb datum sketches = "v2.1" **not done** (`store.ts:81`). byte-compat: sketches without `datumRef` are never touched.
- **NOT associative:** plain Offset Plane, base Midplane, 2-face Midplane, and 3-Point Plane store no `src` — they are one-time XYZ snapshots that do **not** move when their inputs move (2-face midplane is computed once at pick time; 3-point plane is frozen even if the cpoints are later redefined).

**Gaps vs Fusion CONSTRUCT plane menu:**
- ❌ **Plane Through Two Edges** — none.
- ❌ **Plane Tangent to Face at Point** — the tangent plane only accepts cylindrical faces (radial tangent); no tangent-to-general-surface-at-a-point.
- ❌ **Plane Through Point + Edge/Face** (generic point+edge) — closest is `parplanept` (point + parallel-to-face) only.
- ⚠️ Datum v2 sketch-follows-datum limited to cardinal planes; angle/arb datum sketches don't re-bake.

---

## 2. 构造轴 (Construction Axes — `caxes`)

State: `caxes: { dir:'X'|'Y'|'Z'; at:[x,y,z]; dirV?:[..]; src?:{kind:'cylAxis',near,seedAxis}; stale? }[]` (`store.ts:1050`). Consumers always eat `dirV` when present (label `dir` is display only). Dialog `Viewport.tsx:5305-5316`.

| Fusion method | webcad? | Entry / anchor |
|---|---|---|
| **Axis dir X/Y/Z through a point** | ✅ | `caxis` dialog `store.ts:11916-11923`; point via numeric or cpoint dropdown (`Viewport.tsx:5307-5309`) |
| **Axis through Cylinder/Cone face** | ✅ | 🎯拾圆柱面 `startCpatAxisPick` `store.ts:11811`→`applyCpatAxisPick` `store.ts:11821-11836` — fills real `dirV` + `src{cylAxis}` (cones detected as cylinders) |
| **Axis through 2 Points** | ✅ | `axis2pt`/两点轴→`addAxis2Points` `store.ts:11792-11802` (LAST 2 cpoints, arbitrary dir) |
| **Axis normal (⊥) to Face at point** | ✅ | ⊥面轴 `startDatumPick('normalaxis')` `store.ts:11587-11594` (planar face → normal through click) |
| **Axis through 2 Planes (intersection)** | ✅ | 两面轴 `startDatumPick('planeaxis')` `store.ts:11627-11649` (2 non-parallel faces → n1×n2 line) |
| **Axis through an Edge** | ✅ | 沿边轴 `startEdgePointPick('edgeaxis')` `store.ts:11752-11763` (**straight edges only**; curved rejected) |

**Associativity:** only `cylAxis`-sourced axes re-derive (`rederiveDatums` caxes block `store.ts:4544-4569`): re-match nearest parallel cylinder, sign-lock direction, else `stale`. **All other axes are static snapshots** (2-point, normal-to-face, 2-plane, edge axis, manual dialog) — they do not follow their inputs.

**caxes drive geometry:** sweep spine (`sweepAxis='A<i>'` `store.ts:1133`), revolve axis (`applyCpatAxisPick` circpattern/revolve `store.ts:11827`), circular-pattern axis, and hole direction (`drillCaxis` `store.ts:10870`, dialog `Viewport.tsx:5287`).

**Gaps:** no "axis through 2 cylindrical faces (common axis)"; cone axis relies on cylinder detection; no perpendicular-at-vertex distinct from normalaxis. Only cylinder-sourced axes are associative.

---

## 3. 构造点 (Construction Points — `cpoints`)

State: `cpoints: [x,y,z][]` (`store.ts:1049`). Dialog `Viewport.tsx:5277-5290`.

| Fusion method | webcad? | Entry / anchor |
|---|---|---|
| **Point at X/Y/Z** (numeric) | ✅ | `cpoint` dialog `store.ts:11892` |
| **Point Grid** (rect rows×cols / polar count-on-radius) | ✅ | `cptgrid` `store.ts:11876-11890` (bonus vs Fusion; feeds batch-holes) |
| **Midpoint of 2 points** | ✅ | 两点中点 `addMidpointCPoint` `store.ts:11803-11808` (LAST 2 cpoints) |
| **Point at Center of Circle/Cylinder** | ⚠️ cylinder-only | 圆心点 `startDatumPick('circcenter')` `store.ts:11597-11606` (point on cyl axis at click height) |
| **Point Along Path (edge)** | ✅ | 边上点 `startEdgePointPick('ratio')` `store.ts:11687-11693,11765` (ratio 0-1 or `Nmm`; non-line/circle edges are param-`t` approx, noted) |
| **Point at Vertex** | ✅ | 边端点 `startEdgePointPick('vertex')` `store.ts:11766` (nearest endpoint) |
| **Point at Edge Midpoint** | ✅ | 边中点 `startEdgePointPick('mid')` `store.ts:11708,11767` |

**Associativity:** **none.** Every cpoint is a frozen XYZ snapshot (plain state; not re-derived by `rederiveDatums`, which only touches planes/caxes). If the parent moves, the point stays.

**cpoints drive geometry:** batch holes `addHolesAtCpoints` `store.ts:10860` (dialog ⊙批量孔 `Viewport.tsx:5289`), loft cap point `loftCapPoint` `store.ts:1825`, projected as sketch snap/ref points (`extraRefPts` `store.ts:131`, `skGeoFocus` `store.ts:149`), and 3-point-plane / 2-point-axis / midpoint inputs.

**Gaps vs Fusion:** ❌ Point at intersection of 2 edges; ❌ Point at 3 planes; ❌ Point at center of sphere/torus (only cylinder); ❌ Point at circle/arc center by picking the circle edge (must pick a cylindrical face instead). No associativity.

---

## 4. 参考/投影几何 (Project / Include / Intersect)

- **Project geometry (投影几何 / `sk_project`)** — `projectRefToSketch` `store.ts:3710-3728`. Turns `skRefGeo.segs` (solid-edge boundary + section of the body on the current sketch plane, computed by worker via `skGeoFocus`) into **real editable sketch polylines** (closed loop→closed poly = extrudable; open chain→open poly). Idempotent: clears `skRefGeo` afterward so re-clicking won't duplicate. Ribbon tip `ribbon.ts:414`.
- **Project single loop (逐条投影 / `projPickMode`)** — `toggleProjPick` `store.ts:3731` + `projectLoopAt` `store.ts:3736-3752`. Click near one projected loop (≤8mm) → projects only that ring/chain (Fusion per-curve project). Applied from Viewport pointer path `store.ts:6331-6332`.
- **Include 3D geometry (implicit)** — the sketch reference geometry (`skRefGeo`) already folds in body footprint + `cpoints` + body vertices as snap targets projected onto the sketch plane (`skGeoFocus`/`extraRefPts` `store.ts:127-151`), shown before you even project.
- **Intersect / Intersection Curve (相交曲线 / `ccurves`)** — `computeIntersectionCurves` `store.ts:4589-4599` → worker `intersectionCurves()` `cad.worker.ts:5001-5045` (`BRepAlgoAPI_Section` pairwise over active + parked bodies, capped 60 pairs/400 curves, ~1.5mm sampling) → 3D polylines stored in `ccurves`. This is Fusion **Surface ▸ Intersection Curve** (3D result), **not** a sketch-plane Intersect. Cleared via `clearCCurves` `store.ts:4586`.

**Associativity:** **NOT associative.** Projected curves are baked polyline snapshots at projection time — if the parent edge/face later moves, the projected sketch curve does **not** update (no live project link). Intersection curves must be recomputed manually via the button.

**Gaps vs Fusion:**
- ❌ Associative Project (curves that stay linked to and follow the source edge) — webcad's project is a one-shot bake.
- ❌ **Intersect** in the sketch sense (slice a body with the sketch plane to yield a linked sketch profile) — closest is the section already folded into `skRefGeo` for projection, but not a distinct associative "Intersect" command.
- ❌ **Project to Surface** (project sketch curves onto a curved/target surface) — none.

---

## 5. 参考图 — reference / construction sketch geometry (linetypes)

- **`construction?: boolean`** on any `SketchShape` (type decl `store.ts:58-59`): rendered **dashed AMBER `#d9a23a`** (`SketchLayer.tsx:654`), toggled visible by `skView.constr`. Excluded from extrude/export/framing everywhere via `!sh.construction` filters (e.g. `store.ts:2807, 6266, 6283, 7715`). Comment: "构造几何(Fusion X)：虚线显示、可约束可吸附，但唔参与拉伸/导出" (`store.ts:55`).
- **`centerline?: boolean`** (`store.ts:61`): rendered as a **long-short center-line dash** distinct from ordinary construction dashes (`SketchLayer.tsx:653`), semantic = revolve axis / symmetry reference (GM-FP4 #23). Preserved through transforms (`store.ts:5413`).
- **Construction line tool (`cline`)** — `skAddConstructionLine` `store.ts:3821-3828` (dispatch `store.ts:6344`). Drops a ±5000-span **horizontal or vertical** open poly with `construction:true` (and `centerline:true` if `clineCenterline` is on). Orientation from `clineOrient` ('h'/'v'), semantic flag from `clineCenterline` (`store.ts:868`). Used as centering ref / mirror axis / revolve axis. Note: construction lines are excluded from view-framing so the ±5000 span doesn't zoom the camera out (`SketchLayer.tsx:303-305`).
- **Draw-as-construction pre-toggle (`drawConstruction`)** — `store.ts:3810-3811`: when ON, the next-drawn shape is auto-tagged `construction:true` (`store.ts:6640-6642`) — Fusion Linetype pre-switch.
- **Toggle construction (`sk_constr`)** — `toggleConstruction` `store.ts:5904-5913` (dispatch `store.ts:9432`): flips the selected shape between solid ⇄ dashed construction.
- **参考图 (canvas underlay image)** — `canvasImg` `store.ts:11814` + calibration `canvasCal` `store.ts:11819`: a bitmap pinned to the sketch plane for **tracing** (width/opacity/2-point mm calibration). This is a reference *image*, not geometry.

**Gaps:** construction geometry is per-sketch-shape only; no standalone 3D construction/reference sketch object beyond the datum planes/axes/points above.

---

## Summary of key gaps (for the Fusion diff)

1. **Planes:** missing Through-2-Edges, Tangent-to-Face-at-Point (tangent is cylinder-only), generic Point+Edge plane. Datum-v2 sketch-follows-datum only on cardinal planes.
2. **Axes:** only cylinder-sourced axes are associative; no common-axis-of-2-cylinders.
3. **Points:** no 2-edge-intersection, no 3-planes, no sphere/torus center; **no cpoint is associative.**
4. **Project/Include:** project & intersection-curve are **baked snapshots, not associative**; no Project-to-Surface, no associative sketch Intersect.
5. **Construction sketch geo** is solid: construction + centerline linetypes, cline tool, draw-as-construction pre-toggle, per-shape toggle, tracing underlay — all present and correct.
