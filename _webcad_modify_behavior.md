# webcad MODIFY (立体修改) — Behavior Inventory

Read-only inventory of non-sketch MODIFY operations, to be diffed against a Fusion 360 Modify spec.
All anchors are `file:line` at time of writing. Three layers per op:

- **Ribbon activation** — `src/ribbon.ts` MODIFY group (SOLID `ribbon.ts:56-79`; SHEET-METAL `322-325`; SURFACE `341-345`; MESH `282-286`).
- **Store command dispatch** — `src/store.ts` giant `switch` at `store.ts:9497-9663`; feature-edit reopen at `store.ts:10762-10812`.
- **Worker feature exec** — `src/worker/cad.worker.ts` feature loop (`f.type === '…'` branches). Dialog UI lives in `src/components/Viewport.tsx`.

Feature edits are re-openable: double-click a timeline node → `openEditDlg` remaps to a `*-edit` dialog kind (`store.ts:10762-10805`), rebuilds the whole tree. Selection sets (edges/faces) persist via **persistent fingerprints** (edgeFp/faceFp v1 + v2 rotation-invariant + topo), re-resolved each rebuild — this is webcad's answer to topological naming.

---

## Fillet — 圆角

- **Activation:** ribbon `fillet` (shortcut **F**, quick) `ribbon.ts:60`; dispatch enters interactive edge-pick mode `store.ts:9614-9616` → `toggleEdgeRoundPick('fillet')` `store.ts:3905`. NOT auto-all (Fusion-style command).
- **Edge pick (single/multi):** `roundEdgeAt` `store.ts:3907-3947` — resolves nearest B-rep edge via `cad.edgePolylineAt`, highlights whole edge, re-click same edge = deselect (3-sample same-edge test `store.ts:3929-3934`); worker-unavailable fallback = orange point, no deselect `store.ts:3946`.
- **Radius:** command-bar field `edgeRoundSize` `Viewport.tsx:3740-3743`; commit `commitEdgeRound` `store.ts:3948-3963`.
- **Variable radius (const→end):** `filletR2` "末端半径" field `Viewport.tsx:3744-3749`; feature carries `radius2`; worker tapers linearly via replicad tuple `[r_start, r_end]` `cad.worker.ts:1225-1227, 1255`.
- **Per-edge multi-radius:** ≥2 edges → per-edge radius rows `Viewport.tsx:3750-3763`, `edgeRoundRadii[]`; worker groups mids by radius, one scalar fillet per group `cad.worker.ts:1228-1253` (deliberately NOT replicad function-radius, `cad.worker.ts:1229`).
- **Tangent chain (切线链):** `edgeRoundChain` checkbox `Viewport.tsx:3730-3732`; feature `chain` flag `store.ts:3268-3271`.
- **Constant vs chord / setback:** **MISSING.** No chord-length option, no setback/corner-blend controls. Only radius (constant) + linear variable taper.
- **全棱圆角 (filletAll):** ribbon `filletall` `ribbon.ts:62` → `appPrompt` radius → `filletAllEdges` `store.ts:9620-9621, 12848`. AI verb `fillet_all_edges` `store.ts:9362`.
- **Corner/oversize fallback:** worker retries radius × [1, 0.6, 0.3, 0.15] shrink ladder + warns `cad.worker.ts:1240-1262`; fp-resolve-miss → near-point fallback with drift warning `cad.worker.ts:1210-1216`. Live preview (120 ms debounce) `store.ts:3971-3994`.
- **GAPS vs Fusion:** no chord-length fillet, no setback, no corner-type (rolling-ball vs blend), no "rest of body / all edges of face" auto-scope beyond filletAll, no face-fillet or full-round-fillet (3-face) commands.

## Chamfer — 倒角

- **Activation:** ribbon `chamfer` (quick) `ribbon.ts:61`; dispatch → `toggleEdgeRoundPick('chamfer')` `store.ts:9617-9619`. Shares the fillet pick loop (`roundEdgeAt`/`commitEdgeRound`).
- **Modes:** `chamferMode` ∈ equal / two / angle, buttons `Viewport.tsx:3733-3739`; feature `cmode` in `buildRoundFeature` `store.ts:3269-3270`.
  - **Equal distance:** default; single `distance`.
  - **Two-distance:** `chamferSize2` field `Viewport.tsx:3764-3768` → `dist2`.
  - **Distance + angle:** `chamferAngle` field `Viewport.tsx:3770-3774` → `angle`.
  - **Flip reference face:** `chamferFlip` (顶↔底) `Viewport.tsx:3776-3780`.
- **Worker exec:** `cad.worker.ts:1785-1797`; asymmetric path `chamferAsym` `cad.worker.ts:1265-1296` picks top/bottom face by bbox Z as reference (`refZ`, flip-aware), replicad `{distances:[d1,d2]}` or `{distance,angle}` — falls back to equal chamfer + warning if edge not on top/bottom rim `cad.worker.ts:1292-1294`.
- **全棱倒角 (chamferAll):** ribbon `chamferall` `ribbon.ts:63` → `appPrompt` → `chamferAllEdges` `store.ts:9622-9623, 12858`.
- **GAPS:** two-distance / distance+angle only reliable on top/bottom-rim edges (reference face = bbox top/bottom, not the true adjacent face) — honest fallback to equal. No per-edge chamfer sizes (fillet has this; chamfer doesn't). No chamfer-corner setback.

## Shell — 抽壳

- **Activation:** ribbon `shell` (quick) `ribbon.ts:64`; dispatch → `toggleShell` `store.ts:9624-9626, 4000`.
- **Face pick(s) to remove:** `shellPickAt` accumulates open faces `store.ts:4001`; none picked → default opens top face.
- **Thickness:** `shellThickness` (default 4) `store.ts:3998`; edit dialog `shell-edit` field `Viewport.tsx:5028-5031`.
- **Direction (inside/outside/both):** **MISSING.** Only inward shell (positive thickness); negative thickness is guarded-out as illegal `cad.worker.ts:1819-1828`. No outside / both-sides option.
- **Robustness retry:** worker tries thickness × [1, 0.6, 0.35, 0.2] `cad.worker.ts:1822-1826`; picked-face finder via `containsPoint`, else `inPlane('XY', topZ)` `cad.worker.ts:1815-1817`. Shelling already-rounded solids is flagged brittle (`store.ts:4006-4007`, "先抽壳后倒角").
- **Commit:** `commitShell` `store.ts:4002-4010`, faces stored as `nears` + faceFp.
- **GAPS:** no outside/both-side direction, no per-face unique thickness (Fusion "unique thickness override"), no tangent-chain for open-face selection.

## Draft — 拔模

- **Activation:** ribbon `draft` `ribbon.ts:66`; dispatch → `toggleDraftPick` if solid, else `openFeatDlg('draft')` `store.ts:9629, 4309`.
- **Neutral face + pull:** two-stage pick — ① neutral plane (`draftNeutral` = origin+normal), ② side face(s) (`draftSides[]`) `store.ts:4314-4324`. Pull direction = neutral-face normal (implicit, not a separate pick).
- **Angle:** `draftAngle` field; sign convention negated so +angle = draws inward for release `cad.worker.ts:3805-3807`. Edit dialog `draft` kind, single angle field `Viewport.tsx:5035-5037`.
- **Two-sided (双面) + flip:** `draftTwoSided` buckets sides by which side of neutral plane (dot sign) → two draft features ±angle `store.ts:4332-4338`; `draftFlip`.
- **Worker exec:** `cad.worker.ts:3784-3810` — replicad `shape.draft(-angle, sel, neutral)`; RPlane from picked origin/normal, zero-normal → XY fallback; <0.01° skipped (degenerate); failure marks feature red `cad.worker.ts:3810`.
- **GAPS:** no parting-line draft, no draft from a parting sketch/surface, no per-face angle overrides, pull direction can't be an arbitrary axis (locked to neutral normal). Falls to XY neutral if pick incomplete.

## Scale — 缩放

- **Activation:** ribbon `scale` `ribbon.ts:67`; dispatch → `openFeatDlg('scale')` `store.ts:9627`.
- **Uniform:** `factor` field, or "目标最长边" auto-computes factor `Viewport.tsx:4951-4953`.
- **Non-uniform:** `sx/sy/sz` per-axis fields `Viewport.tsx:4954`; worker uses `BRepBuilderAPI_GTransform` + `gp_GTrsf` (plus-kernel symbol) `cad.worker.ts:3765-3778`. Any axis >0 → non-uniform path; three equal → uniform B-rep path `cad.worker.ts:3779-3782`.
- **Base point:** `px/py/pz` field `Viewport.tsx:4955-4956`; "实体中心" button (bbox center) `Viewport.tsx:4957-4962`; construction-point picker `Viewport.tsx:4963-4964`. Default new = `anchorCenter` bbox center; legacy = world origin `cad.worker.ts:3758-3763`. GTransform bakes base point into the affine translate column `cad.worker.ts:3772`.
- **GAPS:** non-uniform axes are world-aligned only (no arbitrary scale directions / per-plane scale). Otherwise close to Fusion Scale.

## Combine (Boolean) — 合并/切割 · 实体布尔

- **Activation:** ribbon `combine` (quick) `ribbon.ts:69` and `bodyboolean` `ribbon.ts:75`; both → `openCombineDlg` `store.ts:9662-9663, 10346`. Needs ≥1 parked (tool) body from "新实体".
- **Target + tool bodies:** target = active body; tool bodies = parked, per-body checkboxes `Viewport.tsx:4938-4944` (single tool auto-checked `store.ts:10352`).
- **Op join/cut/intersect:** `op` select fuse / cut / common `Viewport.tsx:4937`; default **fuse** (Fusion-aligned, avoids accidental cut-all `store.ts:10350`).
- **Keep tools:** `keepTools` checkbox `Viewport.tsx:4945-4949`; default consumes tools `store.ts:10353`. Worker: `_recordBool` for S2 lineage, splices parked unless keep `cad.worker.ts:1770-1779` (bodyboolean branch). Combine dialog commit path `store.ts:12135`.
- **GAPS:** "New Component from combine result" not offered; no interference/keep-region preview; multi-target combine limited to active body as sole target.

## Press Pull — 按拉

- **Activation:** ribbon `presspull` (shortcut **Q**, quick) `ribbon.ts:58`; dispatch `store.ts:9497-9500` — sketch present → extrude dialog; solid face → `togglePushPull` (Q, pick face → offset along normal, + out / − in). Stored as near-point feature re-found each rebuild (`store.ts:4013-…`), uses replicad `basicFaceExtrusion` (imported `cad.worker.ts:8`).
- **GAPS:** press-pull is offset-of-planar-face + extrude-sketch only; no "offset edge / loop", no smart face-set push-pull selecting tangent faces, no press-pull of a face to a Up-To reference.

## Move/Copy — 移动/复制

- **Activation:** ribbon `move` (shortcut **M**, quick) `ribbon.ts:76`; dispatch → `openFeatDlg('move')` `store.ts:9544`.
- **Dialog fields:** `dx/dy/dz` translate + `rx/ry/rz` rotate about body-center axes `Viewport.tsx:4928-4935`. This is the whole-body move.
- **Gizmo:** interactive gumball exists for components — `ComponentGumball.tsx`, transform modes move/rotate/scale `Viewport.tsx:6366`. Move-face gizmo separate (below).
- **Create-copy:** `move` feature copy path — mirror/pattern create copies; Move dialog is transform-in-place. (Feature `move` = transform; `scale`/`transform` grouped `cad.worker.ts:230`.)
- **GAPS vs Fusion Move/Copy:** no explicit "Create Copy" checkbox in Move dialog, no point-to-point mode, no along-two-points / along-axis-distance modes, no per-face/edge move inside Move (that's the separate Move Face op). Rotation is about body-center axes only, not an arbitrary pivot/axis.

## Replace Face / Move Face — 移动面 · 替换面 · 旋转面

- **Move Face (moveface v2):** ribbon `moveface` (quick) `ribbon.ts:59`; dispatch → `toggleMoveFace` `store.ts:9519-9521, 4064`. Multi-face pick with same-plane dedup/deselect `store.ts:4065-4082`; commit `store.ts:4084-4102`.
  - **offset inward re-solve:** dist<0 → `DirectEditWrapper.ReplaceFaceNear` re-solves neighbor faces incl. adjacent fillets `cad.worker.ts:2428-2442`.
  - **outward prism:** dist>0 → `basicFaceExtrusion` prism `fuse` (neighbors NOT re-solved) `cad.worker.ts:2443-2446`.
  - **tilt:** rotate plane about in-face axis through face center (±60° clamp), single-face only `cad.worker.ts:2447-2457`; multi-tilt rejected `store.ts:4092`, `cad.worker.ts:2399`.
  - Multi-face = sequential chaining `_moveFacePlan` (`src/cad/moveFacePlan.ts`) `cad.worker.ts:2397`. Planar faces only (non-planar honestly skipped `cad.worker.ts:2426`).
- **Replace Face:** ribbon `replaceface` (SURFACE group) `ribbon.ts:258`; dispatch → `toggleReplaceFace` `store.ts:9516-9518`; worker `cad.worker.ts:2366-…` planar-substitution via BRepAlgoAPI_Splitter (honest: planar only, no arbitrary-surface replace `ribbon.ts:258`).
- **Rotate Face:** ribbon `rotateface` `ribbon.ts:259`; `toggleRotateFace` `store.ts:9522-9524` (draft-style zero-kernel hinge).
- **GAPS:** Replace Face limited to planar replacement (no target-surface pick); outward move-face is prism-fuse not true face re-solve; tilt single-face only.

## Split Body / Split Face — 分割实体 · 平面切 · 草图分割 · 分割面

- **Split Body (by plane):** ribbon `splitbody` `ribbon.ts:71`; `openFeatDlg('splitbody')` `store.ts:9657`. Dialog: axis X/Y/Z + position + keep-side, or picked cut-plane ghost `Viewport.tsx:4967-4985`. Feature `type:'split'` (additive, non-destructive; keeps timeline) `cad.worker.ts:118-119`. Default position = bbox Z-mid `store.ts:10690-10699`.
- **Split by arbitrary plane (平面切):** ribbon `splitplane` `ribbon.ts:72`; `toggleSplitPlanePick` `store.ts:9658` picks any planar/construction face → prefills splitbody dialog with planeOrigin/planeNormal `store.ts:12410`.
- **Split by sketch (草图分割):** ribbon `splitsketch` `ribbon.ts:73`; `splitBodyBySketch` `store.ts:9659, 12474-12499`. ⚠ Ends parametric timeline — bakes into 2 mesh components (A=outer, B=inner). v1: single closed profile, standard plane only `store.ts:12477-12480`. Worker `cad.splitBySketch`.
- **Split Face:** ribbon `splitface` (SURFACE) `ribbon.ts` splitface tip; `toggleSplitFace` `store.ts:9513, 4182`; worker `DirectEditWrapper.SplitFaceNearByPlane` imprints a dividing edge `cad.worker.ts:2349-2365`. Cutting plane = world axis most perpendicular to face `store.ts:4189-4193`.
- **GAPS:** Split Body by surface-body / by another solid not supported (plane or sketch only); split-by-sketch destroys history (Fusion keeps it); Split Face only by a plane through pick point (no split by sketch/edge/surface).

## Delete Face / Delete — 删面 · 删除

- **Delete Face (直接编辑 / defeature):** ribbon `delface` (quick) `ribbon.ts:65`; `toggleDelFace` `store.ts:9501-9503, 4104`. Multi-face accumulate `store.ts:4112-4116`; commit `store.ts:4118-4124`. Worker `DirectEditWrapper.DeleteFaceNear` = `BRepAlgoAPI_Defeaturing` + heal `cad.worker.ts:2201-2229`; volume-diff no-op detection → honest "face kept" warning `cad.worker.ts:2218-2225`. Requires plus kernel `cad.worker.ts:2206`.
- **Delete (feature/component):** ribbon `delete` `ribbon.ts:78`; removes selected feature/component.
- **GAPS:** Delete Face heals only what OCCT defeaturing supports; no "delete + patch with surface" control; failure is silent-keep (honest but no manual heal option).

## Align — 对齐

- **Exists:** ribbon `align` `ribbon.ts:74`; dispatch → `startFaceMate(true)` one-shot `store.ts:9660, 7106-7108`. Pick base face (fixed) → moving face → planar-coincident or cylindrical-coaxial `store.ts:7110-7119`. One-shot, does NOT record a persistent mate (persistent = "拣面配合"/joints).
- **GAPS:** face/plane and cylinder only; no point/edge/vertex alignment targets, no align-to-origin/construction, component-to-component only (not body-internal align).

## Physical Material / Appearance — 外观

- **Activation:** ribbon `appearance` (shortcut **A**) `ribbon.ts:77`; dispatch `store.ts:9852-9863`.
- **Material presets:** `MATERIALS` table `store.ts:2200-2223` — 22 presets (钢/铝/黄铜/铜/塑料/金/银/钛/不锈钢/玻璃 + PLA/PETG/ABS/TPU/尼龙/树脂) each with color/metalness/roughness/opacity/**density**. `setMaterialPreset` `store.ts:9155`; appearance click cycles presets or enters per-face paint `store.ts:9852-9861`.
- **Per-face color:** `startFacePaint(hex)` → `paintFace` `store.ts:9209-9213`; keyed by faceId, remapped on rebuild, lost when geometry changes. Undo-tracked `store.ts:9212`.
- **Live PBR tweak:** `setMatProp` metalness/roughness/opacity sliders `store.ts:1600, 9155`.
- **User material library:** save/load/delete named presets to localStorage `store.ts:9156-9170`.
- **GAPS:** density drives mass (physical material) but no separate Fusion-style "Physical Material" vs "Appearance" split; no true appearance library (textures limited to brushed/matte/wood tags `store.ts:2201`); no bump/decal appearance, no per-body vs per-face appearance library management beyond color.

## Thicken / Offset Face / Boundary Fill / Silhouette Split — which exist?

- **Thicken (surface→solid):** EXISTS. ribbon `thicken` (SURFACE, quick) `ribbon.ts:253` + `thickenquilt` (whole quilt) `ribbon.ts:254`. `toggleThicken` `store.ts:9504-9506, 4126`; worker `DirectEditWrapper.ThickenFaceNear` / `MakeThickSolidBySimple`, signed thickness for flip, outputs independent parked body `cad.worker.ts:2230-2245`.
- **Offset Face:** EXISTS as **Offset Surface (偏移曲面)** `offsetsurf` `store.ts:9507-9509, 4142`; worker `OffsetSurfaceNear` `cad.worker.ts:2246-2257`, ± / both-side. Also **Offset Solid (整体偏移)** `offsetsolid` `ribbon.ts:68`, `store.ts:9628`, worker `BRepOffsetAPI_MakeOffsetShape` `cad.worker.ts:2258-…` (uniform offset of all faces). Note: offsets a face into a NEW surface body, not an in-place face offset like Fusion Offset Face.
- **Boundary Fill:** **PARTIAL / different.** No solid multi-cell Boundary Fill. There is surface **Boundary Patch (边界补面)** `BRepOffsetAPI_MakeFilling` `cad.worker.ts:3216-3250` and surface fill/bridge — fills N-edge holes, optional thicken. Not the Fusion cell-selection Boundary Fill.
- **Silhouette Split:** **MISSING** as a modeling op. "silhouette" appears only in drawing/mesh edge extraction (`io/meshProject.ts:5`, `store.ts:14622`) and CAM, not as a Modify feature.
- **GAPS:** no in-place Offset Face (only offset-to-new-surface); no true Boundary Fill (cell selection between tools); no Silhouette Split.

## Change Parameters / Manage — 参数 · 设计表

- **Change Parameters:** ribbon `params` (CONFIGURE, quick, ƒx) `ribbon.ts:84`; dispatch → `toggleParamsPanel` `store.ts:9877`. User params = named variables/expressions bound to dimensions (`ParamsPanel.tsx`, `paramBindings`, `applyParamBindings`).
- **Design table (configurations):** named VARIANT snapshots (driver params + suppression + appearance + component poses) `store.ts:1893-1895, 13232-13254`. Save/restore configs; not a spreadsheet grid but a config list.
- **GAPS:** no editable design-table grid (row=config, col=param) like Fusion/SolidWorks; params are single-value driver vars, favorites/units column not a full table UI.

---

## Cross-cutting gaps vs Fusion Modify

- No **chord-length fillet**, **setback**, **corner blends**, **face fillet / full-round fillet**.
- Shell **inward-only** (no outside/both, no per-face thickness).
- Draft = neutral-normal pull only (no parting-line / parting-surface draft, no per-face angle).
- Move = whole-body translate+rotate about body center (no copy checkbox, no point-to-point / along-path modes); face-level move is the separate Move Face.
- Replace Face = **planar substitution only** (no arbitrary target surface).
- Split Body by **plane or sketch only** (no surface/solid tool); split-by-sketch **destroys history**.
- **No in-place Offset Face, no Boundary Fill (solid), no Silhouette Split.**
- Physical Material and Appearance are merged into one preset system; no true appearance/texture library.
- No design-table grid.

**Strengths not in a stock kernel:** variable + per-edge multi-radius fillet, asymmetric chamfer, GTransform non-uniform scale with base point, defeature Delete Face, Move Face inward kernel re-solve (adjacent fillet re-solve), multi-face chaining, persistent edge/face fingerprint re-resolution (v1/v2-rotation-invariant/topo), live fillet/chamfer preview, honest degrade-and-warn everywhere.
