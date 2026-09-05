# webcad — SOLID Modeling (non-surface CREATE) Behavior Inventory

CURRENT behavior, read-only audit. Anchors are `file:line`. This documents what webcad
ships today so it can be diffed against a Fusion 360 solid-feature spec.

## Architecture / entry points (how a solid feature flows)

1. **Ribbon** defines command IDs — `src/ribbon.ts`. SOLID tab ~`ribbon.ts:26-73`; a duplicate
   CREATE tab lists the same IDs ~`ribbon.ts:276-323`; a PRIMITIVES sub-group ~`ribbon.ts:38-42, 210-220`.
2. **Command dispatch** — `store.ts` `runCommand` switch, cases start ~`store.ts:9504-9663`.
   Each case either opens a dedicated dialog, opens the generic `featDlg`, or calls an `addX` action.
3. **Two dialog systems:**
   - **Dedicated `CommandDialog` blocks** in `Viewport.tsx` for Extrude / Sweep / Loft / Hole.
   - **Generic `featDlg`** — one opener `openFeatDlg(kind)` (`store.ts:10642`, defaults `10646-10687`),
     rendered by a big `featDlg.kind === '…'` cascade in `Viewport.tsx:4859-5318`. Covers all
     primitives + Revolve + Pattern/Mirror/Combine/Scale/Draft/Thread/etc.
4. **Feature execution** — worker `buildShape`, a long `} else if (f.type === '…')` chain in
   `cad.worker.ts` (dispatch inventory: `1560→4105`). Boolean helper `merge(shape, op)` applies
   new/cut/intersect/newbody.
5. Operation model `BoolOp` = `new | cut | intersect | newbody` (shared state `sketchOp`), plus a
   `sketchAsComponent` flag for "New Component".

No "Base Feature" and no "Derive" command exist (`grep basefeature|derive` in `store.ts` → none).

---

## Extrude
- **Entry:** ribbon `extrude` (`ribbon.ts:26`, shortcut E) → dispatch `store.ts:9525` → `openExtrudeDlg` (`store.ts:4676-4707`).
- **Dialog:** `Viewport.tsx:5545-5627` (dedicated `CommandDialog`).
- **Profile / region pick:** `detectRegions` splits the sketch into ≤64 profile faces
  (`store.ts:4683-4699`); if >1 region user clicks canvas regions to pick which to extrude
  (`extrudeRegionFaces`/`extrudeRegionSel`, `toggleExtrudeRegion` `store.ts:4710`; "全选/清空区域"
  `Viewport.tsx:5556-5562`). Default = none selected (Fusion multi-profile parity).
- **Operation** (`sketchOp`): `＋加料/new`, `－切割/cut`, `∩相交/intersect`, `⬡新实体/newbody`
  (`Viewport.tsx:5616-5622`), plus **🧩 新组件 / New Component** (`sketchAsComponent`, `Viewport.tsx:5624`).
- **Extent** (`extrudeExtent`, setter `store.ts:4722`; `Viewport.tsx:5563-5570`):
  `distance` · `symmetric` · `twosides` (side1 + side2 asymmetric, `extrudeSide2` `store.ts:4720`)
  · `through` (贯通, cut-only) · `toface` (To-Object, planar face parallel to sketch, + offset
  `extrudeToFaceOffset`, associative `store.ts:4729-4739`) · `next` (To Next, stops at first solid face).
- **Other fields:** distance (`extrudeHeight`); start-offset (`extrudeStart`, along sketch normal,
  `store.ts:4718`); draft angle (`extrudeDraft`, XY/horizontal sketch only — note `Viewport.tsx:5607`);
  twist (`sketchTwist`); flip direction (`extrudeFlip`, `Viewport.tsx:5599`).
- **On-canvas manipulator:** `ExtrudeArrow` (import `Viewport.tsx:57`, render `Viewport.tsx:3540`) —
  drag arrow to set distance live before commit.
- Worker exec `cad.worker.ts:1570`.
- **Gaps vs Fusion:** To-Object only reaches a *plane parallel to the sketch* (not to an arbitrary
  body/surface/point); draft (taper) restricted to horizontal sketches; no "Symmetric — measure:
  whole/half length" toggle beyond `symmetric`.

## Revolve
- **Entry:** ribbon `revolve` (`ribbon.ts:27`) → dispatch `store.ts:9591` → `featDlg` kind `revolve`
  (payload `{prof, bundle}`, `store.ts:9608`). Guard: **XY sketch only** (`store.ts:9596`).
- **Dialog fields** (`Viewport.tsx:5038-5093`): axis = X/Y/Z **or** a construction axis; pick a
  **sketch line as axis** (`Viewport.tsx:5043-5067`); 🎯拾轴 pick cylinder face
  (`startCpatAxisPick`); construction-axis / construction-point selectors; 🎯拾中心点
  (`startRevAxisPtPick` `store.ts:11842`); axis point `ox/oy/oz` + direction `dx/dy/dz`; angle 1–360;
  **薄壁 / thin `wall`** (shell the revolve); **两侧对称 `sym`** (only when 0<angle<360); operation
  new/cut/intersect/newbody.
- Action `addRevolve` (`store.ts:10361`); arbitrary axis via `axisV/axisOrigin` (T781). Worker `cad.worker.ts:1711`.
- **Gaps:** wall = single shell thickness (no separate inner/outer offset); non-XY/angled-plane
  sketches refused.

## Sweep
- **Entry:** ribbon `sweep` (`ribbon.ts:28`) → dispatch `store.ts:9570` → `openSweepDlg` (`store.ts:4742`).
- **Dialog** (`Viewport.tsx:5629-5693`):
  - **Path:** drawn polyline/spline, or a **construction axis** used as straight ridge
    (`sweepAxis` + `sweepAxisLen`). Path from a solid edge = not available (must be a drawn sketch/caxis).
  - **Guide rail:** `sweepGuide` (single, Fusion Guide Rail; `clearSweepGuide`, chip `Viewport.tsx:5640`).
  - **Section:** `circle` (Ø `sweepDia`) **or** `profile` = *last closed sketch profile* (`sweepSection`).
  - **Twist** `sweepTwist`, **taper / end-scale** `sweepScale`, **wall (hollow tube)** `sweepWall`,
    **3D climb-Z** `sweepClimb` (`store.ts:4750-4763`).
  - Operation new/cut/intersect/newbody.
- Worker exec `cad.worker.ts:3351` (path3 spine) / `3396`.
- **Gaps:** exactly **one** guide rail; profile section is implicit "last closed profile" (no explicit
  multi-profile/section pick); no chain-select of body edges as the path.

## Loft
- **Entry:** ribbon `loft` (`ribbon.ts:29`) → dispatch `store.ts:9545`; sections accumulated via
  "＋放样截面" (`loftSections`), dialog opened by `openLoftDlg` (`store.ts:12937`).
- **Dialog** (`Viewport.tsx:5695-5744`): N sections chip; **rail** `loftRail` (**1 only** — single
  auxiliary spine, `Viewport.tsx:5706`); **直纹 ruled** `loftRuled`; **closed loop** `loftClosed` (≥3
  sections); **continuity** `loftContinuity` = normal / G1 tangent / G2 curvature (spline lofts only);
  **thin wall** `loftWall`; **loft-to-point cap** `loftCapPoint`/`loftCapEnd` (construction point apex);
  operation new/cut/intersect/newbody.
- Worker exec `cad.worker.ts:2023`.
- **Gaps:** one rail max; no per-section takeoff-weight/tangent-magnitude control; no centreline loft.

## Rib / Web
- **Entry:** ribbon `rib` (`ribbon.ts:30`) → dispatch `store.ts:9655` → `addRib` (`store.ts:12338`).
  **No creation dialog** — thickness/height/draft are **hardcoded** (`thickness=6, height=20, draft=0`,
  `store.ts:12351-12354`) and only editable later in the timeline.
- **Input:** open centreline(s) on an **XY sketch only** (`store.ts:12343`). Multiple open polylines →
  a **Web net** (每条独立 rib feature; crossings auto-fuse).
- **Worker exec** `cad.worker.ts:3955-3998`: per-segment thin rectangles; **drop-to-body** (extrude
  DOWN to solid floor `minZ` so it fuses) or extrude UP by `height` if standalone; draft = base→top
  taper via loft (`cad.worker.ts:3984`).
- **Gaps:** no dialog (no thickness / direction / draft / "two-side symmetric" chooser at create time);
  no "normal to sketch vs parallel to sketch" direction toggle; XY only.

## Hole
- **Entry:** ribbon `hole` (`ribbon.ts:33`, shortcut H) → `toggleHole` (`store.ts:10573`); dialog
  `Viewport.tsx:4651-4773`.
- **Placement:** click a face to set centre (`holePickAt`), else centred; **batch by sketch points**
  (`addHolesAtSketchPoints`, `Viewport.tsx:4662`); **batch at construction points**
  (`addHolesAtCpoints`, drill direction along a construction axis, `Viewport.tsx:5287`); **bolt-circle**
  (`holeBoltCircle`, PCD Ø + count, `Viewport.tsx:4763-4770`).
- **Types** (`holeType` `store.ts:1655`, `Viewport.tsx:4664-4670`): `simple` (通/盲), `counterbore`
  (沉头, ISO 4762), `countersink` (埋头, 82/90/100/120° `holeCsAngle`), `nuttrap` (螺母槽, hex nut trap),
  `tapped` (攻牙底孔; optional modeled thread via `holeTapModeled`→ithread).
- **Extent:** through vs blind depth (`holeThrough`/`holeDepth`, auto ≈1.5×Ø); conical drill-tip bottom
  (`holeDrillPoint`, 118/135/90°); fine pitch; 3D-print clearance (`holeClearance`); mouth 45° chamfer
  (`holeChamfer`, through only); **obround/slot** hole (`holeSlot` + len/angle).
- **Standard sizes:** M2–M24 clearance / tap / heat-set-insert dropdown (`Viewport.tsx:4677-4691`).
  Cb/Cs sizes auto from ISO tables, user-overridable (`holeCbD/cbDepth/csD`).
- Commit `commitHole` (`store.ts:10429+`).
- **Gaps vs Fusion:** no "Spot Face" named type; no tapered/pipe-thread hole; hole extent lacks
  "To Next / To Object" (only through / blind-depth); nuttrap & modeled-tap are webcad extras.

## Thread
Three distinct commands:
- **Standalone threaded rod** `thread` (`ribbon.ts:34`) → `featDlg` kind `thread` (d/pitch/h,
  `Viewport.tsx:5237`); worker `cad.worker.ts:3498` (real ISO helical tooth swept on a core).
- **面加螺纹 / external on face** `othread` (`ribbon.ts:35`) → `featDlg` `othread`
  (`Viewport.tsx:5199-5207`): `ThreadSpecSelect` ISO M picker, d/pitch/height/pos, **modeled** checkbox,
  **left-hand** checkbox; worker `cad.worker.ts:3527`.
- **内螺纹孔 / internal tap** `ithread` (`ribbon.ts:36`) → `featDlg` `ithread`
  (`Viewport.tsx:5208-5218`); worker `cad.worker.ts:3547`.
- **Face pick:** `startThreadFacePick` (`store.ts:10816`) — pick a cylinder face; outer face = external,
  bore = internal; diameter/height/position auto-read (Fusion Thread parity).
- **Modeled vs Cosmetic:** `modeled` flag (default OFF = cosmetic annotation; ON = true helical teeth,
  compound — warns "no chamfer/STEP after"). Spec from `ThreadSpecSelect`. Left-hand supported.

## Emboss / Text
- **Text (sketch)** `text` (`ribbon.ts:31`) → dispatch `store.ts:9652` → `addText` (`store.ts:4352`),
  fields via `openSkTextDlg` (`store.ts:5423`: text/size/height/align). On XY plane, extrude, fuse/cut.
- **Emboss (on face)** `emboss` (`ribbon.ts:32`) → dispatch `store.ts:9653` → `toggleEmboss`
  (`embossPick`, `store.ts:931/4359`). Pick a **planar** face → text → **raise** (fuse, +depth) /
  **engrave** (cut, −depth) along the face normal (`arbPlane`).
- Worker `text` exec `cad.worker.ts:3999`; face branch (`f.arbPlane`) `cad.worker.ts:4004-4015`.
- **Gaps:** emboss targets a **planar** face only (no wrap onto curved/cylindrical faces); no image
  decal deboss through this path.

## Primitives
All via `openFeatDlg` (defaults `store.ts:10646-10687`; no solid required, `noSolidNeeded` `store.ts:10644`;
respects cut mode). Fusion's set is Box/Cylinder/Sphere/Torus/Coil/Pipe — webcad has all plus many extras.
- **box** l/w/h (`Viewport.tsx:5094`); worker `makeBaseBox` (`cad.worker.ts:1928`).
- **cylinder** d/h (`5099`).
- **sphere** d (`5103`).
- **torus** outer Ø `d` / tube Ø `td` / **arc** (partial C-ring) (`5106`). Worker `cad.worker.ts:1981-1990`:
  **`outerTrue` semantics** — new files `a` = *true outer radius*, midline = a−tube (so dialog "外径"
  = real outer Ø); legacy files `a` = midline radius. `arc<360` = partial torus.
- **coil** d / pitch / h / wire Ø, **+末端Ø `d2`** (tapered/conical spring) (`Viewport.tsx:5169`,
  default `store.ts:10671`). Worker `cad.worker.ts:3481`: `r2` present → variable-radius helix sampled
  to a B-spline spine + swept; else `makeHelix`. (Self-collision warning when pitch<wire.)
- **Pipe:** no primitive dialog. `pipe` command (`ribbon` / dispatch `store.ts:9654`) → `addPipe`
  (`store.ts:12322`) builds **two sweeps** (outer fuse + inner cut, hardcoded outerR=12/innerR=8, wall 4,
  editable in timeline) along a drawn path. The `tube` primitive is the hollow-cylinder analog.
- **Extras beyond Fusion:** cone/frustum (+`sides`→pyramid), wedge, dome (spherical cap), halfcyl (D),
  pie (sector), tube (hollow), rtube (rect tube RHS), profile (L/U/T structural), rbox (fillet box),
  prism (n-gon), pyramid, gear/gearbox/worm/crowngear/rack/pulley, sheetmetal (L/U/Z + K-factor),
  cylpatch (boss/pocket/flat on a cylinder). Worker `prim` exec `cad.worker.ts:1926-1991` (+ dedicated
  branches for coil/thread/gear/… ).

## Pattern
- **Rectangular** `pattern` → `openFeatDlg('pattern')` (dispatch `store.ts:9630`). Fields
  `Viewport.tsx:4862-4887`: **target = 整个实体 / 所选特征** (`target`), distance type spacing/extent
  (`dtype`), X count/dx, Y count/dy, **Z count/dz (true 3-D grid)**, symmetric X/Y/Z, **direction axes**
  `dir1`/`dir2` (construction axes for skew/diagonal), **include parked bodies** (`bodies`). Worker
  `cad.worker.ts:1832`.
- **Circular** `circpattern` (T757) → `openFeatDlg('circpattern')` (`store.ts:9632`). Fields
  `Viewport.tsx:4897-4913`: target body/feature; axis preset + 🎯拾轴 (cylinder face) + construction
  axis/point; axis point ox/oy/oz + dir dx/dy/dz (arbitrary/skew); count; **angle mode = full 360° /
  angle / symmetric** (`mode`) + `totalAngle`. Worker `circPattern` `cad.worker.ts:4040`.
  Legacy `cpattern` (`store.ts:9631`, simpler axis X/Y/Z + count + angle + centre; worker `cad.worker.ts:3811`).
- **Path** `pathpattern` (`ribbon.ts:49`) → `addPathPattern` (`store.ts:12362`): drawn path + copy body
  along it (XY only). Worker `cad.worker.ts:1905`.
- **Type selector (Fusion: bodies / features / components / faces):** webcad supports **body | feature |
  components**. Component patterns create assembly occurrences that share the source component definition:
  rectangular patterns use world X/Y/Z; circular patterns support an arbitrary axis, origin, and full/angle/
  symmetric distribution. **Faces remain unavailable** until a reliable B-rep face-set copy path exists.

## Mirror
- **Entry:** ribbon `mirror` (`ribbon.ts:52`) → dispatch `store.ts:9543` → `openFeatDlg('mirror')`.
- **Fields** (`Viewport.tsx:4914-4927`): 🎯拾面 pick any planar mirror face (`startMirrorFacePick`);
  **target = body / feature**; plane = XY/XZ/YZ / construction plane / PICK; offset; **mirrorOp** =
  new-body (park) vs join. Worker `cad.worker.ts:1992`.
- **Gaps:** mirror **components** not supported (body/feature only).

## Boolean / Combine
- **Combine** `combine` 合并/切割 (`ribbon.ts:69`) → `openCombineDlg` (`store.ts:10346`, dispatch
  `store.ts:9663`). Dialog `Viewport.tsx:4936-4950`: op **fuse / cut(target−tool) / common(∩)**; check
  which **parked tool bodies** participate; **Keep Tools** (`keepTools`). Emits a `bodyboolean` feature;
  worker `cad.worker.ts:1766-1779` (real B-rep, `keep` retains tool). `bodyboolean` also on ribbon (`71`).
- **New Body:** `newbody` command (`ribbon.ts:37`) parks the active body and starts a fresh one (worker
  `cad.worker.ts:1762`); also reachable as the `newbody` operation inside Extrude/Sweep/Loft/Revolve.
  `stepbody` = imported STEP B-rep body (worker `cad.worker.ts:1757`).
- **Move-Face** `moveface` 移动面 (`ribbon.ts:59`) → dispatch `store.ts:9519`; `moveFaceAt`/commit
  (`store.ts:4065-4101`). Pick planar face(s) → **offset ±mm along normal** or **tilt angle**
  (`moveFaceKind` offset|tilt). Inward = kernel re-solve of adjacent faces/fillets; outward = add
  material. Worker `moveface` `cad.worker.ts:2383`. **Planar faces only; tilt = single-face only.**

## 其他 — Base/Derive + Draft/Scale/Thicken/Shell/Offset/Split
These sit in the SOLID/MODIFY ribbon; several are **MODIFY** (act on an existing body), not CREATE-from-sketch.
- **Base Feature:** 无此功能 (no non-parametric base-feature envelope / edit-mode).
- **Derive:** 无此功能.
- **Draft** `draft` (`ribbon.ts:66`) → `toggleDraftPick` if solid else `featDlg('draft')` (angle,
  `Viewport.tsx:5035`); worker `cad.worker.ts:3784`. **Modify.**
- **Scale** `scale` (`ribbon.ts:67`) → `openFeatDlg('scale')` (`store.ts:9627`). Fields
  `Viewport.tsx:4951-4966`: uniform factor / target-longest-edge mm / **non-uniform sx/sy/sz** (real
  B-rep GTransform) / **base point px/py/pz** (default bbox centre). Worker `cad.worker.ts:3756`. **Modify.**
- **整体偏移 / Offset solid** `offsetsolid` (`ribbon.ts:68`) → `featDlg('offsetsolid')` (uniform ± all
  faces; `Viewport.tsx:5032`). Worker `cad.worker.ts:2258`. **Modify.**
- **Thicken** `thicken` (`ribbon.ts:253`) → dispatch `store.ts:9504` (pick a face/surface → thicken to a
  solid plate; ± flips direction). Worker `thickenface` `cad.worker.ts:2230`. **Create-from-surface.**
- **Shell** `shell` (`ribbon.ts:64`) → `toggleShell` (`store.ts:4000`, dispatch `store.ts:9624`): pick
  open faces + wall thickness. Worker `cad.worker.ts:1798`. **Modify.**
- **Split Body** `splitbody` (`ribbon.ts:71`) → `openFeatDlg('splitbody')` (axis/offset/keep side;
  `Viewport.tsx:4967`); `splitBodyBySketch` for arbitrary-profile split. Worker `split` `cad.worker.ts:4081`.
- **Press/Pull** `pushpull` — offset nearest face along normal (fuse out / cut in), re-finds the face each
  rebuild. Worker `cad.worker.ts:3844`. (Face-driven direct edit.)

---

## Notable gaps already visible (inventory, not critique)
- **Pattern/Mirror object types** limited to **body | feature** — no *components* and no *faces* targets.
- **Rib** has **no create-time dialog** (thickness/height/draft hardcoded, timeline-only) and is XY-only;
  **Pipe** likewise hardcodes radii at create time (no dialog).
- **Extrude/Hole "To Object/To Next"** are partial: extrude To-Object reaches only a plane parallel to
  the sketch; holes have no To-Next/To-Object extent.
- **Sweep** = single guide rail + implicit "last closed profile" section; **Loft** = single rail, no
  per-section tangent weighting.
- **Revolve** refuses non-XY/angled-plane sketches; thin-wall is a single shell thickness.
- **Emboss** only onto planar faces (no wrap onto curved faces).
- **No Base Feature and no Derive** commands at all.
- Conversely webcad **exceeds** Fusion's create set with many extra primitives (structural profiles,
  gears/gearbox/worm/crown/rack/pulley, sheet-metal, cylinder-patch) and extra hole types (nuttrap,
  modeled-tap, obround, drill-tip, bolt-circle/batch).
