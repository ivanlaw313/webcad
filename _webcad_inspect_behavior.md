# webcad — CURRENT INSPECT / Measure / Analysis behavior (code inventory)

READ-CODE-ONLY snapshot to be diffed against a Fusion INSPECT spec. All anchors are `file:line`.
Ribbon INSPECT tab tools: `src/ribbon.ts:110-125` (measure / measureedge / measureface / measureangle /
section / interference / zebra / curvmap / gausscurv / curvcomb / minradius / draftanalysis / slopeanalysis).
Command dispatch: `store.ts:10040` (`section`), `10052` (`interference`), `10059` (`slopeanalysis`),
`10061` (`sectionprops`); measure/analysis toggles are direct store actions.
Units: `Unit = 'mm'|'cm'|'inch'`, formatters `fmtLen/fmtArea/fmtVol` `store.ts:2349-2361`
(mm→1 decimal, cm→2, inch→3 / in³ / in²). **Precision is fixed by these formatters — NOT user-settable.**
Every readout is **unit-aware** (reads `s.unit`). Fabrication output always stays mm (comment 2346).

---

## 1. Measure

### Two-point distance — `measureDist`, ΔXYZ, elevation
- Activation: `toggleMeasure` `store.ts:13237` (ribbon `measure`, shortcut **I**). Click 2 points on a body.
- Compute: `addMeasurePoint` `store.ts:13393-13400` → straight `Math.hypot` distance only; stores
  `lastMeasure {value,label:'两点距离'}` for "capture as parameter".
- ΔXYZ + elevation: computed in the **panel**, not the store — `Viewport.tsx:6343-6349` (readout at 6347):
  ΔX=`b[0]-a[0]`, ΔY=`b[2]-a[2]` (three-Z→CAD horizontal), ΔZ=`b[1]-a[1]` (three-Y→vertical/up);
  elevation = `atan2(vertical, horiz-hypot)` in °, labeled 仰角/"（连线对水平面）".
- Points/line drawn `Viewport.tsx:3406-3412`. Big readout `Viewport.tsx:6345-6346`.
- Snapping: relies on raycast pick point (no explicit vertex/mid/center snap priority in measure code).

### Edge measure — `measureEdgeAt` (length / Ø)
- `store.ts:13405-13420` (`toggleMeasureEdge` 13403). Calls worker `cad.measureEdgeAt(cp)`.
- Reports: closed circular edge → Ø + R + 周长; arc → Ø/R + 弧长; straight → 长. Adds ISO fastener
  suggestion `recommendFastenerSize` (tap / clearance / loose) for closed circular edges.
- Mesh (imported) variant: `measureMeshEdgeAt` `store.ts:13422-13437` via `measureMeshEdgeChain`
  (feature-edge-chain **approximation**, flagged "近似").

### Face measure — `measureFaceAt` (area / type)
- `store.ts:13442-13459` (`toggleMeasureFace` 13440). Calls worker `cad.measureFaceAt(cp)`.
- Reports surface type (PLANE/CYLINDRE/CONE/SPHERE/TORUS → 平面/圆柱/圆锥/球/环面) + area; cylinders add
  Ø/R + nearest ISO screw. Mesh variant `measureMeshFaceAt` `store.ts:13461-13471` via
  `measureMeshFaceRegion` (coplanar region-grow **approximation**).

### Angle measure — `measureAngleAt` (inter-normal angle)
- `store.ts:13477-13491` (`toggleMeasureAngle` 13474). Pick two faces → angle between **normals**.
- Reports `夹角 θ` **and supplement `180−θ`** (13489), tags 垂直/平行·反向; guards against picking the same
  face (θ<0.5° → keep face 1). NOTE: this is the **normal-angle**, not a true edge-based dihedral; the two
  are reported together and the user picks the correct one geometrically. Works on solid or imported mesh.

### Mesh-component measure — `measureMeshComponent`
- `store.ts:8489-8508` (S160). Per-component read-only: volume, surface area, AABB, tri/vertex counts,
  watertight flag (`meshManifold`). Unit-aware (`fmtVol/fmtArea/fmtLen`).

### Two-component measure — `measureTwoComponents` (center dist + exact clearance)
- `store.ts:7664-7694`. Center-to-center distance + ΔX/ΔY/ΔZ, plus **exact tri-tri min clearance**
  `minDistanceMeshMesh` (`cad/minDistance.ts`, AABB-pruned, exact closest-point pair) when NA·NB ≤ 120k;
  else strided vertex-sample fallback (flagged 采样近似). Draws `compMeasureSeg` line.

### Selection-property inspector — `inspectAt`
- `store.ts:13254-13272`, always-on `inspectMode:true` (`store.ts:13250`). Single click in model mode →
  face/edge geometry (Alt+click = edge) without entering a command; reuses worker measureFace/EdgeAt.

**Measure — vs Fusion / gaps**
- No **unified Measure dialog**: Fusion has one Measure command that measures between ANY two selected
  entities (point/edge/face/body in any combo, with min-distance / angle / area contextually). webcad has
  **separate mode toggles** (measure / edge / face / angle) that are mutually exclusive; no arbitrary
  entity-to-entity distance (e.g. edge↔face, point↔face) on a single solid — only 2 free points, or
  component↔component clearance.
- No **selection-filter / selection-priority** UI (vertex/edge/face/body). Snap priority not implemented.
- **Precision is fixed** (1 decimal mm) — no "precision" dropdown like Fusion.
- Angle is normal-based (+ supplement), not a picked-edge dihedral; no 3-point angle.
- Mesh edge/face measures are explicitly **approximate** (region-grow / feature-chain), not B-rep exact.

---

## 2. Interference

### Static — `checkInterference`
- `store.ts:7771-7875` (ribbon `interference`, dispatch 10052). Visible components only, needs ≥2.
- Pipeline: tight world-AABB per part (all verts transformed) → AABB overlap test with **0.5 mm tolerance**
  (just-touching excluded) → Monte-Carlo `estimateOverlapVolume` pre-filter (<1 mm³ = AABB false alarm) →
  **exact `meshBoolean('intersect')` + `meshVolume`** (divergence-theorem) for true overlap volume & tight
  bbox; falls back to Monte-Carlo ≈ + AABB box if boolean fails (non-watertight). Also computes **nearest
  clearance gap** (strided vertex sampling, capped 900 pts/part).
- Report fields: `interfReport {hits:[{a,b,vol,exact,min,max}], gap:{a,b,gap}|null, comps}` (`store.ts:7871`);
  highlights `interfHits` (boxes) + `interfMeshes` (exact red geometry). Panel auto-opens.
- Panel UI: `Viewport.tsx:6206-6221` (per-pair vol + exact/≈ + 🔍 zoom-to-region + nearest gap).
- Report export: `copyInterfReport` `store.ts:7882-7893` (clipboard text report).

### Across motion (sweep) — `interferenceAcrossMotion`
- `store.ts:7897-7987` (S163). Sweeps one **driver** joint over full range (angle: aMin..aMax or 0–360;
  slider: needs sMin/sMax), re-propagates motion links + recomputes FK each step; per step AABB→Monte-Carlo
  solid-overlap (>1 mm³ = real clash). **Binary-search refines first-clash driver value** (8 iters).
- Guards: rigid joint (no DOF), driven-of-a-link (asks to sweep the driver), limit-locked (probes full turn),
  heavy assembly downsampling; multi-DOF joints sweep **main axis only** (honestly flagged). Reports first
  clash value + clashing pairs + volume; highlights `interfHits`. Does NOT mutate live joint values.

**Interference — vs Fusion / gaps**
- Volume path is exact when manifold; else **Monte-Carlo estimate** (≈), unlike Fusion's B-rep-exact clash.
- Clearance/nearest-gap in the static check is **vertex-sampled** (approx), whereas the two-component measure
  uses exact tri-tri. No "compute interference between selected bodies only" subset picker (all visible).
- Cross-motion is a **single-driver** sweep with step sampling — thin parts / between-step tunneling can be
  missed (self-flagged); no continuous swept-volume, no multi-joint simultaneous sweep.

---

## 3. Section analysis

### Live clip / capped section — `section` state
- State: `section {on, axis:'X'|'Y'|'Z', offset, capped, flip}` `store.ts:1690, default 9428`.
- `setSection` `store.ts:9429-9443`: default = **render-time clip plane** (hollow-looking cut). `capped:true`
  → `refreshSectionCap` `store.ts:9449-9462` boolean-intersects body with a half-space (`cad.splitBuild`) →
  real solid with **filled** cut face; `flip` keeps the other half. Recomputed on every control change/rebuild.
- UI: `Viewport.tsx:6124-6137` — X/Y/Z buttons, offset range slider (`sectionRange`), 实心封盖(capped),
  翻面(flip). **Live**: yes (clip is real-time; capped re-runs the boolean).

### Section cut properties — `computeSectionCut`
- `store.ts:13352-13392` (S185, triggered from section panel `Viewport.tsx:6136`, NOT a ribbon item).
- Slices the **active body mesh** at the section plane (`sliceMesh`; non-Z axis remapped so cut axis→Z),
  classifies loops by nesting-depth parity (`classifyLoops`: even=solid, odd=hole → multi-body + nested
  islands correct), then `sectionProps` (`cad/sectionProps.ts`): **area, centroid, Ixx, Iyy, principal
  I1/I2 @angle, perimeter, nBodies, nHoles**. 2D frame labeled per axis (YZ/ZX/XY). Warns if non-watertight.
- rAF-throttled live recompute while dragging offset (`store.ts:9436-9442`). Circle = mesh-tessellation approx.

### Sketch section properties — `computeSectionProps`
- `store.ts:13323-13347` (S119, ribbon `sectionprops` `ribbon.ts:453`). Same shoelace `sectionProps` on
  closed **sketch** profiles (rect/circle-96/poly), construction/open excluded, holes auto-subtracted.

**Section — vs Fusion / gaps**
- Section-cut props are **mesh-based** (tessellation approx), not analytic B-rep section.
- Only 3 **axis-aligned** planes (X/Y/Z) — no arbitrary/planar-face-defined section plane, no multi-plane
  section, no section-view annotation/dimensioning. Clip is single-plane.

---

## 4. Curvature / surface analysis

- Mode state `inspectShade: 'off'|'zebra'|'curv'|'gausscurv'|'comb'` + `inspectStripe` `store.ts:13274-13277`;
  mutually exclusive with X-ray/wireframe/draft/slope (all overlays force each other off).
- **Zebra**: screen-space `onBeforeCompile` shader on the active body only `Viewport.tsx:378-380` (view-space
  normal stripes; stripe count `inspectStripe` 4–120).
- **Curvature (mean |H|)** + **Gaussian K**: real per-vertex `meshCurvature` (`cad/curvatureAnalysis.ts`,
  Meyer 2003 cotangent Laplace-Beltrami + mixed Voronoi, angle-deficit K); overlay `CurvatureOverlay.tsx`
  (jet ramp for H, divergent blue/white/red for K; 95th-pctile robust normalization).
- **Curvature comb**: per-vertex principal curvature + directions `cad/curvatureComb.ts` (Rusinkiewicz/Taubin
  shape-operator LSQ); rendered `CurvatureCombOverlay` `Viewport.tsx:3390`.
- **Minimum radius of curvature**: `runMinRadius` `store.ts:13283-13294` → `minRadiusOfCurvature`
  (κmax=|H|+√(H²−K)); reports R_min + marks location (MinRadiusMarker). Ribbon `minradius`.
- **Draft analysis**: `runDraftAnalysis` `store.ts:13295-13304` + `cad/draftAnalysis.ts` — per-B-rep-face
  draft angle vs pull dir, classes positive/negative(undercut)/vertical, panel switches X/Y/Z pull.
  Needs `faceGroups` (imported raw mesh has none → refused).
- **Slope analysis**: `runSlopeAnalysis` `store.ts:13309-13318` + `cad/slopeAnalysis.ts` — per-face tilt vs
  reference (default +Z), classes flat/transition/steep (30°/60° thresholds). Mutually exclusive with draft.

**Curvature — vs Fusion / gaps**
- All curvature/draft/slope are **discrete-mesh** (per-vertex/per-face averaged), explicitly "趋势/近似",
  not analytic B-rep curvature; free-form faces show averaged values that can hide in-face extremes.
- Zebra is a **screen-space** stripe approximation, not reflection-line accurate; no isophote/environment
  mapping. No curvature legend scale numbers by default. No accessibility/section-level continuity (G0/G1/G2)
  auto-report — user reads stripe breaks visually.

---

## 5. Mass / physical properties

- Two computations coexist:
  - `computeProps(mesh)` `Viewport.tsx:2171-2210` (inline): AABB dims, volume, surface area, centroid (COM),
    **axial** inertia about centroid X/Y/Z (mm⁵), watertight flag. Used for the always-on readout.
  - `computeMassProps` `cad/massProps.ts:67` (S117): full divergence-theorem (Mirtich/Eberly) — volume, area,
    centroid, **full inertia tensor** about centroid (`inertia`) and origin (`inertiaOrigin`), **principal
    moments** I1≤I2≤I3 (symmetric-eigenvalue closed form), optional mass (density g/cm³ → tonne/mm³).
- OBB: `orientedBBox` `cad/obb.ts` (PCA min bounding box, 省料% vs AABB) `Viewport.tsx:3122, 6515`.
- **Display = always-on inline status bar** `vp-props` `Viewport.tsx:6505-6547` (gated by `showProps`):
  bbox+diagonal, volume, area, COM, mass, **principal moments + radius of gyration** (6513), OBB,
  watertight/printability, density `<select>` (6519-6532), 3D-print filament length + time + cost estimates,
  ⊕ COM marker toggle (`toggleCom` `store.ts:13232`), print XY/shrink compensation, `BedFitBadge`, beam stress.
- Assembly-level aggregate (no active body): `Viewport.tsx:6549+` — sums vol/area/mass + mass-weighted COM
  across visible components, per-part material density (`MATERIALS`).
- `toggleProps` `store.ts:13231` (`showProps` default true). Density `bodyDensity` default 2.7 `store.ts:9510`;
  material presets `MATERIALS` `store.ts:2322-2345` (density per material); `setPhysicalMaterial` `9518`
  sets density without changing appearance; `setMaterialPreset` `9514` sets color+finish+density.

**Mass props — vs Fusion / gaps**
- **No modal "Properties" dialog**: Fusion pops a dedicated Physical/Section Properties dialog (selectable
  accuracy Low/Med/High, relative/absolute accuracy, per-body/component selection, copy). webcad shows a
  single **inline status-bar** for the active body (or whole-assembly aggregate) — no per-selected-body
  properties, no accuracy setting, no world-vs-COM coordinate toggle in UI.
- Inertia readout uses **display-unit-independent g·cm²** (fixed), COM shown in current unit; principal axes
  **vectors** are computed (eigenvalues) but the axis **directions** are not displayed, only magnitudes + k.
- Mesh-based (tessellation) volume/inertia — accurate for watertight solids, approximate otherwise
  (non-watertight is flagged, not corrected).

---

## 6. Component color cycling / display toggles

- **Auto-color**: `autoColorComponents` `store.ts:8153-8155` (cycles `COMP_PALETTE`), UI 🎨自动配色
  `BrowserTree.tsx:512`. Per-component: `setComponentColor` 8157, `setComponentOpacity` 8158,
  `setComponentMaterial` 8160 (sets color from material).
- Display toggles: X-ray `toggleXray` `store.ts:8152`, wireframe `toggleWireframe` `13893`, render mode /
  SSAO / ortho / HDRI (`store.ts:8000-8028`), COM marker `toggleCom` `13232`, section clip, explode+xray view.
- **Gap**: no Fusion "color faces/bodies by <property>" (by material / by appearance override per face);
  auto-color is per-component palette cycling only. No per-face appearance override.

---

## Cross-cutting gaps summary
1. No **unified Measure command** (arbitrary entity↔entity distance/angle/area with selection filter &
   precision setting) — replaced by 4 exclusive mode toggles + component-pair clearance.
2. No **modal Properties/Section-Properties dialog** with accuracy control or per-selection scope — inline bar.
3. All curvature/draft/slope/section-cut/interference-volume are **discrete-mesh approximations** (honestly
   labeled) rather than analytic B-rep, except the exact tri-tri clearance and manifold-boolean clash volume.
4. Section limited to 3 axis-aligned planes; no arbitrary-plane / multi-plane / annotated section view.
5. No user-configurable measurement precision; readouts are unit-aware but fixed-decimal.
