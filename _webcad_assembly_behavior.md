# webcad ASSEMBLY (装配) — behavior inventory (code-grounded)

Scope: what the ASSEMBLE workspace actually does today, with `file:line` anchors, to diff against a Fusion 360
Assemble spec. Read-only survey. Key files:
- `src/store.ts` — all state + commands (Component/joint/mate/motion state, ~L1294–1560; impls scattered)
- `src/assembly/kinematics.ts` — Joint type, FK, DOF, closed-loop 4-bar/slider-crank/six-bar, 1-DOF dynamics
- `src/assembly/linkage.ts` — general planar closed-loop solver (findLoops / loopPlane / solveLoop)
- `src/assembly/mateSolve.ts` + `faceMate.ts` + `mates.ts` — face-pair mate solving
- `src/components/JointsPanel.tsx` — the joint/motion UI panel
- `src/components/JointGizmo.tsx` — in-viewport joint manipulator/limits viz
- `src/components/ComponentGumball.tsx` — move+rotate gumball for a selected component
- `src/ribbon.ts` — ASSEMBLE tab (L133–147) + 🧪LAB 传动/机构/仿真 (L156–188)

Data model note: a `Component` is `{ id, name, mesh, pos[3], rot?[3], hidden?, color?, material?, groupId?, src? }`
(`store.ts:1294`). There is NO `body` concept inside a component — each component is one baked/frozen mesh.
`grounded` is a single top-level `string | null` (`store.ts:1496`), not a per-component flag.

---

## New Component — from scratch, from bodies, activate/edit-in-place, ground

- **From scratch / "New Component" ribbon** = `newcomp` (`ribbon.ts:137`) → `newComponent` (`store.ts:14304`).
  It FREEZES the single current active scratch body (`bodyMesh`) into a component, placed at the running
  `originX` and then advances originX +130mm (`store.ts:14319-14328`). Errors if no active body (`14306`).
  There is NO "create empty component then model into it" and NO multi-body "component from selected bodies of
  a body" — the design is one active scratch solid → freeze → component (`newComponent` also invoked by the
  `op:'new'` extrude path `store.ts:10056-10063` = Fusion "new-component as edit target" semantics).
- **Parametric source** captured on freeze: `src = { features, sketchSources }` (`store.ts:14313, 14319`) so the
  component can be reopened parametrically. Imported STL/OBJ/STEP parts have NO `src` (`importStl` 14332 etc.).
- **Activate / edit-in-place (edit-in-context)** = `editComponent` (`store.ts:5523`, ribbon ✎). Guards against
  editing two at once (`5528`), auto-freezes any live scratch body first (`5537`), restores feature tree +
  sketch sources, enters edit with `editingComponent` set + `editPreFreezeSnap` for transactional cancel.
  `finishComponentEdit` (`5559`) re-freezes; `cancelComponentEdit` (`5575`) rolls the whole enter transaction
  back (undoes both auto-freeze + edit pushes, `5578-5596`). Non-`src` (imported) parts can't be edited this way.
- **Ground** = `setGrounded(id|null)` (`store.ts:8734`); a single grounded datum. `ComponentGumball` hides the
  gumball for the grounded part (`ComponentGumball.tsx:88-89`); `mateSolve`/`solveMates` treat grounded as fixed
  (`mateSolve.ts:57`, `store.ts:7275`). FK roots (no incoming joint) stay at identity (`kinematics.ts:89-90`).
- **Subassembly groups** (T788/S123): `groupId` on component (`store.ts:1294-1296`), `group`/`ungroup`
  (`store.ts:7893+`), nested `groups` with local `origin/rot` frame, `rotateGroup` (`store.ts:1306`), group
  show/hide (`store.ts:7914-7917`). This is webcad's nearest equivalent to Fusion sub-assemblies.

vs Fusion / limits: no true empty-then-populate component; no "component from bodies" split of a multi-body part
(webcad has no multi-body-per-component); no external-component / linked-file insert (only STL/OBJ/3MF/STEP mesh
import as new components). Ground is single-part, matching Fusion's typical single ground.

## Components — copy/paste, rename, color, isolate/visibility, move/rotate, delete

- **Copy** = `duplicateComponent` (`store.ts:7886`); plus linear/circular/grid arrays `arrayComponent` /
  `circArrayComponent` / `gridArrayComponent` (`store.ts:1462-1464`, impls 8024/8037/8057) and `mirrorComponent`
  (`store.ts:1479`). No OS clipboard paste-across-doc; array = the "pattern component" story.
- **Rename** = `renameComponent` (`store.ts:7878`, undoable).
- **Per-component color/material** = `setComponentColor` (`7879`), `setComponentOpacity` (`1459`),
  `setComponentMaterial` (`1460`), `autoColorComponents` (`1456`), palette `COMP_PALETTE`.
- **Isolate / show-all / visibility** = `isolateComponent` (`store.ts:7488`, hides all others via `hidden` flag);
  per-part `hidden` toggled in the browser tree; group-level show/hide (`7914`). "Show all" = clear `hidden`.
- **Move / rotate (transform)** = `setComponentPos` (`store.ts:7485`) + `setComponentRot` (`7486`), driven in the
  viewport by `ComponentGumball` (drei `PivotControls`, translate arrows + rotate rings, `ComponentGumball.tsx`).
  On drag-end it decodes the world delta back to `{pos, rot°}` via `worldToPose` (`faceMate.ts:109`) and calls
  `resolveMates` so followers re-snap (`ComponentGumball.tsx:119-136`). Also many placement helpers:
  `dropComponentToFloor`, `stackComponents`, `arrangeForPrint`, `centerComponentXZ`, `seatComponent`,
  `scaleComponent`/`scaleComponentXYZ`, `separateMeshComponent`, `planeCutComponent`, `componentBoolean`
  (mesh-level union/subtract/intersect, `store.ts:1490-1493`).
- **Delete** = `deleteComponent` (`store.ts:1480`).

vs Fusion: transforms are stored as component pos + XYZ-euler rot (not a full 4×4 occurrence transform / no
per-occurrence flexible sub-assembly). No "capture position of a single component", no rigid/flexible sub-assembly
toggle. Move gumball is world-axis only (no local/joint-relative move modes, no "point-to-point" capture).

## Joints — types, creation, origin/alignment, limits, motion

- **8 joint types** (`kinematics.ts:3`, DOF map `:25`, labels `:26`): `rigid`(0), `revolute`(1), `slider`(1),
  `cylindrical`(2), `ball`(3), `planar`(3), `screw`(1), `pinslot`(2). Covers all 7 Fusion joint types PLUS
  `screw` (helical, lead mm/rev, `kinematics.ts:52-58`). Fusion's exact set = rigid/revolute/slider/cylindrical/
  pin-slot/planar/ball — all present; `pinslot` = Fusion pin-slot (`kinematics.ts:66-75`).
- **Creation paths:**
  - Panel: `JointsPanel` add row — pick parent → child → type → axis (X/Y/Z) → `addJoint` (`JointsPanel.tsx:129-132`,
    `store.ts:8736`). Anchor defaults to `componentCenter(child)` (`store.ts:8993`), axis = chosen world axis.
  - Face-pick joint = `jointpick` ribbon (`ribbon.ts:139`) → `startJointPick` (`store.ts:7149`): pick a face on
    parent then child; child snaps to mate + a real joint is built with axis/anchor derived from the picked
    cylinder/plane (cyl → revolute/slider/cyl/rigid; plane → rigid/planar).
  - Hole-pick re-aim = `startJointHolePick` (`store.ts:7290`) / `applyJointHolePick` (`7291`): click a
    cylindrical hole/shaft → joint anchor = hole center, axis = hole axis (per-joint 🎯 button `JointsPanel.tsx:169`).
- **Joint origin / alignment:** anchor `[x,y,z]` + axis `[x,y,z]` in three.js world coords (`kinematics.ts:13-14`).
  Basis for slide/planar U,V derived deterministically (`kinematics.ts:76-83`, mirrored in `JointGizmo.tsx:31-33`).
  There is NO Fusion-style dual joint-origin (separate origin snap on each of the two components with
  offset/angle/flip between them) — one shared world anchor per joint, no between-origin offset fields.
- **Limits:** `aMin/aMax` (deg), `sMin/sMax` (mm) per joint (`kinematics.ts:19-20`), edited as number inputs in the
  panel (`JointsPanel.tsx:176,185,202`). Enforced as the single source of truth in `jointMotion` clamp
  (`kinematics.ts:38-41`) so FK/trace/animation all respect them. At-limit readout turns red ⚠ (`JointsPanel.tsx:136`).
  No "rest value" offset field separate from limits.
- **Motion (drive):** live sliders — `setJointValue` (`store.ts:8826`) drives `angle`/`slide`/`angle2`/`angle3`/
  `slide2`. Continuous drive doesn't push undo (config edits do, `8829-8830`). Panel per-type controls:
  revolute/cyl 转, slider/cyl 移, ball 绕Z/Y/X, pinslot 转+滑, planar 移U/移V/转, screw 转+导程 (`JointsPanel.tsx:173-217`).
  Continuous "▷运动" spin button (`JointsPanel.tsx:71-84,260`). `homeJoints` zeroes all (`store.ts:8914`).
  In-loop drive routes to the closed-loop solver `solveLoop` (`store.ts:8831-8848`).

## As-Built Joints — exists

Yes. `asBuiltJointChecked(jointType)` (`store.ts:11428`): check exactly 2 components in the browser tree → adds a
joint in their CURRENT positions with NO snapping/movement (Fusion As-Built Joint semantics). Default revolute;
type selectable (revolute/rigid/slider/cylindrical/ball). Axis = vertical through child center (must re-aim via
hole-pick/panel). Declared at `store.ts:1071`. Gap vs Fusion: axis defaults crude (no geometry inference at build).

## Joint Origin — custom joint origin points

Partial. No standalone "Joint Origin" feature object you place and reuse. Origins are: (a) component center default
(`componentCenter` `store.ts:8993`), (b) geometry-snapped via face-pick joint (`startJointPick`) or hole-pick
(`applyJointHolePick`). Construction points/axes exist in the modeling side (`caxes`, cpoint) but are not wired as
selectable joint origins. Gap: no named/reusable joint-origin entities, no origin offset/angle between the two faces.

## Rigid Group — lock several components together

Implemented as chained rigid joints, not a distinct group object. `rigidGroupChecked` (`store.ts:11416`): check ≥2
components → first is leader, each other gets a `type:'rigid'` joint to the leader (`11420-11422`). Moving/driving
the leader carries the whole group (FK identity). "Ungroup" = delete the rigid joints in the panel. Distinct from
subassembly `groupId` grouping (which is a visibility/transform tree, not a kinematic lock). Gap: no first-class
Rigid Group node in a browser (it's N rigid joints); no partial rigidity.

## Contact Sets / Enable All Contact — exists (single global toggle)

Global boolean `contactSets` + `toggleContactSets` (`store.ts:8898-8899`), UI 🧱 button (`JointsPanel.tsx:160`).
When ON, dragging a joint slider stops the child the instant it would collide with a third component — `setJointValue`
sub-steps and bisects to the contact point (`store.ts:8850-8880`), collision = AABB overlap + Monte-Carlo solid
overlap >2mm³ (`jointsCollide` `store.ts:747`). Also `driveJointToContact(jointId, dir, axisKind)` (`store.ts:11439`)
= "drive to contact" 🧱± buttons (sweep 5°/2mm + bisect). This is Fusion "Enable All Contact" style (one switch),
NOT named Contact Sets between chosen pairs. Gap: no per-pair contact sets, no "Enable Contact Set" list.

## Motion Study / Motion Link — animate joints over time

- **Motion Links (齿轮比):** `motionLinks` (`store.ts:1508`) `addMotionLink(driver, driven, ratio, kind?, driver2?,
  ratio2?)` (`store.ts:8901`). Supports gear ratio, `kind:'rack'` (angle→slide rack-and-pinion), and a SECOND
  driver for planetary (`driven = ratio·driver + ratio2·driver2`, `1507-1508`). Cycle detection rejects loops
  (`8903-8908`). Propagated through `propagateLinks` on every drive (`store.ts:8895`). Teeth-count ratio helper
  (−z1/z2) in panel (`JointsPanel.tsx:326-332`). Belt/pulley = same ratio link (no separate belt entity). Rack = the
  gear-rack `kind`. Gearbox wizard auto-builds joints+links (`ribbon gearbox`, `store.ts:8654-8655`).
- **Motion Study (dynamics):** `runMotionStudy(jointId, spec)` (`store.ts:11493`) → `simulateMotion`
  (`kinematics.ts:371`): trend-level 1-DOF (revolute/slider only) point-mass + gravity + linear spring + viscous
  damper, semi-implicit Euler → `q(t)` trace (`motionStudy` state `store.ts:1501`). ⚙动力学 panel inputs
  mass/k/c/q0/q0v (`JointsPanel.tsx:218-249`), RAF playback (`JointsPanel.tsx:88-104`). Explicitly NOT commercial
  multibody. Gap vs Fusion Motion Study: single joint, single DOF, no multi-actuator timeline of forces.
- **Keyframe animation:** `jointKeyframes` (`store.ts:1543`), `addJointKeyframe(t)` (`8953`), `applyJointTime(t)`
  linear-interpolates between frames (`8965`), timeline scrub + play in panel (`JointsPanel.tsx:277-297`). This is
  the closest to a Fusion animation timeline (joint value keyframes over seconds).
- **Capture Position:** `jointPoses` (`store.ts:1538`), `saveJointPose`/`applyJointPose`/`deleteJointPose`
  (`8920/8928/8951`), 📍 button (`JointsPanel.tsx:262`) = Fusion Capture Position (named pose snapshots).

## Assembly-specific — closed-loop mechanisms, interference, explode

- **Closed-loop mechanisms:**
  - 4-bar: `makeFourBar` (`store.ts:8746`), `solve4Bar` (circle-circle loop closure, `kinematics.ts:146`),
    parametric by link lengths `setFourBar` (`8750`), branch flip `flipFourBar` (`8759`).
  - Slider-crank: `makeSliderCrank` (`store.ts:8775`), `solveSliderCrank` (`kinematics.ts:318`), reachability scan
    `sliderCrankReachability` (`kinematics.ts:333`) warns when offset too large.
  - Six-bar (Stephenson-III): `makeSixBar` (`store.ts:8788`), `solveSixBar` via general `solveLinkage`
    (`kinematics.ts:244,298`).
  - **General planar closed loops** on real joints: `findLoops` + `loopPlane` + `solveLoop` (`linkage.ts`), invoked
    from `setJointValue` when a driven joint is in a loop (`store.ts:8831-8848`). Grübler mechanism DOF shown in
    panel (`JointsPanel.tsx:145`, `mechDOF = ΣDOF − 3·loops`). Planetary = double-driver motion link (above), not a
    dedicated planetary object. Scope: planar loops only (parallel revolute axes / in-plane sliders), else honest
    fallback (`linkage.ts:8-16`). 4-bar analysis (velocity ratio / transmission angle / mechanical advantage):
    `runLinkageAnalysis` (`store.ts:8762`, `fourBarVelocity` `kinematics.ts:174`).
  - Motion trace (coupler curve / piston line): `traceMotion` (`store.ts:8795`). Swept envelope rectangle:
    `computeEnvelope` (`store.ts:8815`).
- **Interference check:** whole-assembly `checkInterference` (`store.ts:7493`, ribbon `interference` L114) — tight
  world-AABB overlap >0.5mm between visible components + nearest-gap clearance estimate; overlap-volume helper
  `overlapVolume.ts`. Across-motion sweep: `interferenceAcrossMotion(jointId)` (`store.ts:7619`, 🔍 button
  `JointsPanel.tsx:170`) — sweeps a joint's full travel (incl. gear links) and bisects the first-collision drive
  value. Gap: interference is AABB/Monte-Carlo trend, not exact B-rep clash of the whole tree.
- **Explode view:** `explode` scalar + `setExplode` (`store.ts:7871-7872`), `vpDlg:'explode'` dialog
  (`store.ts:1357`, ribbon `explodeview` L226), animation record (`recordReq:'explode'`). Radial auto-explode from
  assembly center by slider. Gap: no manual per-component explode steps / no exploded-line trails / no saved
  explode animation sequence.
- **Persistent mates (face-pair):** `mates` (`store.ts:1350`), `startFaceMate` (`7106`) / `applyFaceMate` (`7111`),
  bbox mate `mates.ts`, exact face mate `faceMate.ts`, sequential re-solve `resolveMates` (`store.ts:7220`, directed
  last-wins topo order), simultaneous least-squares closed-loop `solveMates` → `mateSolve` (`store.ts:7261`,
  `mateSolve.ts`). Only planar-coincident + concentric(cyl) mate kinds; over-constraint surfaced via `mateErrors`
  + Grübler mobility<0 warning. One-shot `align` (`ribbon.ts:74`) snaps without recording. Gap: no angle/tangent/
  symmetry mates, no mate limits.

## Cross-cutting gaps vs Fusion Assemble

1. No multi-body-per-component; "New Component from bodies" and "component from selected bodies" absent (one frozen
   mesh per component).
2. No dual joint-origin with offset/angle/flip between two component origins; single shared world anchor only.
3. Rigid Group and Contact Set are implemented as rigid joints / a single global contact flag — no first-class
   named Rigid-Group or per-pair Contact-Set entities.
4. Motion Study is trend-level 1-DOF dynamics; no multibody force/torque timeline. Keyframe animation exists but is
   joint-value only (no camera/appearance/component-move keyframes).
5. Mates limited to planar-coincident + concentric; interference & contact are AABB/Monte-Carlo trend, not exact
   B-rep. Explode is a single radial slider, no ordered explode steps or trails.
6. No external/linked-component references (no distributed design); arrays substitute for pattern-of-component.
