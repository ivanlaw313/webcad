# Fusion 360 — SOLID tab MODIFY (立体修改, non-sketch) grammar (live capture)

Captured live from Autodesk Fusion (Education License), DESIGN workspace, SOLID tab, mm units, English UI.
Purpose: reference for webcad SOLID-modify parity. Companion to `_fusion_solid_spec.md` (CREATE) + `_fusion_construct_spec.md` (datums).
Scratch geometry on canvas during capture: one **box body** + one **cylinder body** (stacked, cylinder sits on box top) + one **construction axis** (vertical) + a sketch. Left clean by operators #1/#2.

Inherited quirks (confirmed): (a) **multi-selection-slot focus** — you must click the target selection slot to activate it before picking geometry; stray empty-canvas clicks PAN or clear the slot. (b) **IME focus-drop** — Escape is often dead; exit a tool via right-click marking-menu → OK/Cancel. (c) thin silhouette **edges are pixel-fragile** to hit; faces/vertices snap reliably.

---

## 1. Fillet — shortcut F  [VERIFIED LIVE, committed]
**Path:** MODIFY > Fillet (F).
**Pre-selection / prompt:** canvas hint "Select edges, faces, or features to fillet". Accepts **edges, faces, OR whole features**. Picking a box edge → row "1 Edge". Edges snap OK on strong silhouette edges.
**Dialog panel (FILLET, docked top-right), top→bottom:**
- **Type** — dropdown, 3 options: **Fillet** (default) / **Rule Fillet** / **Full Round Fillet**. (Rule Fillet = auto-apply by a rule/tag; Full Round = replaces a face with a full-round blend between its two neighbours — needs 3 face picks.)
- **Radius-group list box** — one **row per radius group**. Each row = `[N Edge/Face]` selection · `[radius value]` · `[2nd value — greyed unless Asymmetric/Variable]` · `[continuity dropdown]`. Multiple groups let different edges take different radii in ONE fillet feature.
- **+ / x** buttons under the list = **add a new radius group** (pick more edges → give them a *different* radius) / remove the selected group. THIS is the "add a second radius-group with a different value" mechanism.
- **Radius Type** — dropdown, 4 options: **Constant** (default, single radius along the whole edge) / **Chord Length** (radius derived from a chord width) / **Variable** (per-endpoint & mid-point radii — variable-radius fillet lives HERE, not a separate field) / **Asymmetric** (two different radii on the two faces of the edge → enables the 2nd greyed value box).
- **Edges/Faces/Features** — [Select] button (the active pick slot).
- **Tangent Chain** — checkbox, **default ON** (auto-extends the fillet along tangent-connected edges).
- **Tangency Weight** — value box `1.00` (appears when a row's continuity = Tangent G1; controls the G1 blend fullness).
- **Corner Type** — dropdown, 2 options: **Rolling Ball** (default) / **Setback** (3-edge corners get a setback blend).
- **Per-row continuity dropdown** (last column of each radius-group row): **Tangent (G1)** (default) / **Curvature (G2)**.
- Footer: (i) · **OK** (disabled until a radius ≠ 0) · **Cancel**.
**On-canvas manipulator:** picking an edge drops a **radius drag handle** on it + a floating **inline value box** ("0.00 mm" → typed 8) — drag or type to set the radius live; a live rounded preview updates. A small hover card ("Constant — Applies a single radius value along an entire fillet") explains the Radius Type on hover.
**OK flow / Timeline:** OK commits; the picked edge is rounded; **Timeline** appends a **Fillet** node (rounded-corner icon). Double-click to re-edit.
**★ Answers to mission Q:** Constant/Chord are values of **Radius Type** (4-way: Constant/Chord Length/Variable/Asymmetric), NOT a separate "Fillet Type". "Fillet Type" here = Fillet/Rule/Full-Round. Corner Type = Rolling Ball/Setback. Tangent Chain = a checkbox. **Variable radius IS offered** — as Radius Type = Variable (per-endpoint), plus the multi-radius-group +/list for different constant radii per edge set.

---

## SOLID → MODIFY dropdown — full menu order (as shown live), with shortcuts
1. **Press Pull** — shortcut **Q**
2. **Fillet** — shortcut **F**
3. **Chamfer**
4. **Shell**
5. **Draft**
6. **Scale**
7. **Combine**
8. **Offset Face**
9. **Replace Face**
10. **Split Face**
11. **Split Body**
12. **Silhouette Split**
--- (separator)
13. **Move/Copy** — shortcut **M**
14. **Align**
15. **Delete** — shortcut **Del**
16. **Remove**
--- (separator)
17. **Simplify ▶** (submenu — mesh/direct-edit cleanup)
--- (separator)
18. **Volumetric Lattice**
19. **Physical Material**
20. **Appearance** — shortcut **A**
21. **Manage Materials**
22. **Change Parameters** (fx icon)
23. **Compute All** — Ctrl+B
24. **Bill of Materials**

(Separators group: Press-Pull/Fillet/Chamfer/Shell/Draft/Scale/Combine/OffsetFace/ReplaceFace/SplitFace/SplitBody/Silhouette | Move-Copy/Align/Delete/Remove | Simplify | materials + params + compute + BOM.)

## 2. Chamfer — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Chamfer.
**Pre-selection / prompt:** canvas hint "Select edges, faces, or features to chamfer". Same picker as Fillet (edges/faces/features). Picked a box edge → row "1 Edge".
**Dialog panel (CHAMFER):**
- **Chamfer-group list box** — one row per chamfer group: `[N Edge]` · `[distance value]` · `[2nd value — greyed unless Two-Distance/Distance-and-Angle]`. Same multi-group model as Fillet.
- **+ / x** — add / remove a chamfer group (different edges → different distances in one feature).
- **Type** — dropdown, 3 options: **Equal Distance** (default, symmetric 45°-style) / **Two Distance** (independent setback on each face → enables the 2nd value) / **Distance and Angle** (one distance + a chamfer angle).
- **Edges/Faces/Features** — [Select].
- **Tangent Chain** — checkbox, **default ON**.
- **Corner Type** — dropdown, 3 options: **Chamfer** (default) / **Miter** / **Blend** (how 3-edge corners are resolved).
- Footer: (i) · OK (disabled until distance ≠ 0) · Cancel.
**On-canvas manipulator:** picked edge gets a **distance drag arrow** + floating inline value box ("0.00 mm") — drag/type to set the setback; live bevel preview. Hover card: "Chamfer — Creates a chamfer to join beveled edges at the corner."
**Timeline:** OK appends a **Chamfer** node (same pattern as Fillet).
**★ Fillet vs Chamfer:** near-identical dialog skeleton (group list + Type + Tangent Chain + Corner Type). Differences: Chamfer Type = Equal Distance/Two Distance/Distance and Angle (vs Fillet's Fillet/Rule/Full-Round + separate Radius Type); Chamfer Corner Type = Chamfer/Miter/Blend (vs Fillet's Rolling Ball/Setback); no continuity/G1-G2 or Tangency-Weight on Chamfer.

## 3. Shell — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Shell.
**Pre-selection / prompt:** canvas hint "Select faces to remove or body to shell". Pick **face(s) to remove** (they become the open mouths) OR pick the **whole body** (hollow with no opening). Picked box front face → highlighted blue = the face that will be removed. Field "Faces/Body — 1 selected [x]" supports MULTIPLE faces (pick several to open several sides).
**Dialog panel (SHELL):**
- **Faces/Body** — [Select] → "N selected" [x].
- **Tangent Chain** — checkbox, **default ON**.
- **Shell Type** — a **2-icon segmented toggle** (icons small; read as {shell removing the selected faces = open shell (default) / fully-enclosed hollow shell keeping all faces}. Meaning INFERRED — icons too small to read a tooltip live).
- **Thickness** — a single value box whose LABEL follows Direction: **"Inside Thickness"** (when Direction=Inside), would be "Outside Thickness" (Outside), and Inside+Outside pair (Both). Default `0.00 mm`; typed 2 → 2mm walls. Tooltip: "Inside Thickness — Specify thickness for inside direction". **This is a UNIFORM thickness for all remaining faces — no per-face thickness field in the Shell dialog** (per-face different wall thickness is done afterward with **Offset Face** on individual inner faces; Shell itself is uniform).
- **Direction** — dropdown, 3 options: **Inside** (default, walls grow inward, outer size preserved) / **Outside** (walls grow outward) / **Both** (splits thickness in/out; would show two thickness boxes).
- Footer: (i) · OK (enabled once a face/body picked + thickness ≠ 0) · Cancel.
**On-canvas manipulator:** a floating inline thickness value box near the removed face + a small arrow; live hollow preview (front face open, 2mm walls). No drag-arrow needed but the value box updates live.
**Timeline:** OK appends a **Shell** node.
**★ Answer to mission Q (per-face thickness):** NO — Shell applies one uniform thickness to all remaining faces; the only per-*direction* control is Inside/Outside/Both. Different thickness per face = a follow-up Offset Face op.

## 4. Draft — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Draft.
**Pre-selection / prompt:** canvas hint "Select pull direction" (first input is the pull direction, then faces).
**Dialog panel (DRAFT):**
- **Type** — a **2-icon toggle** (draft mode): icon 1 (default, selected) = **Fixed Plane** draft (faces are drafted relative to a fixed neutral plane); icon 2 = **Parting Line** draft (faces drafted about a parting edge/silhouette line). Confirmed via "One Side — Create draft on one side of **fixed plane**" tooltip.
- **Pull Direction** — [Select] (pick a **plane / planar face / edge** that defines the pull/mold-open direction; the draft angle is measured from a plane perpendicular to this).
- **Faces** — [Select] (the face(s) to taper). Multiple faces allowed.
- **Tangent Chain** — checkbox, **default ON**.
- **Draft Sides** — dropdown, 3 options: **One Side** (default — "Create draft on one side of fixed plane") / **Two Side** (independent draft each side of the neutral plane) / **Symmetric** (equal draft both sides).
- **Angle** — value box (appears once Pull Direction + Faces are picked; default `0.0 deg`; the taper angle). *(Not driven to the point of showing the box live, but it is the single numeric of the command — standard.)*
- Footer: (i) · OK (disabled until valid) · Cancel.
**On-canvas manipulator:** an **angular drag handle** on the drafted face + inline deg value box; a pull-direction arrow glyph shows the neutral plane. Live tapered preview.
**Timeline:** OK appends a **Draft** node.
**★ Modes summary:** Type = Fixed Plane / Parting Line; Draft Sides = One Side / Two Side / Symmetric; single Angle value. Pull Direction + Faces are two separate sticky selection slots.

## 5. Scale — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Scale.
**Pre-selection / prompt:** canvas hint "Select bodies or sketches to scale". Scales bodies / components / sketches.
**Dialog panel (SCALE):**
- **Entities** — [Select] (the body/sketch/component to scale). Multiple allowed.
- **Point** — [Select] (the **scale anchor/origin** — a vertex, sketch point, or origin point that stays fixed while everything scales about it).
- **Scale Type** — dropdown, 2 options: **Uniform** (default) / **Non Uniform**.
- **Scale Factor** — when Uniform: a **single** value box (default `1.0`; e.g. 2 → double size). When **Non Uniform**: splits into **X Scale Factor / Y Scale Factor / Z Scale Factor** (three independent factors, each default 1.0). *(Factor field(s) appear once Entities + Point are set.)*
- Footer: (i) · OK (disabled until entities+point valid) · Cancel.
**On-canvas manipulator:** a scale gizmo at the Point; dragging scales live with an inline factor value box. (Non-Uniform shows per-axis handles.)
**Timeline:** OK appends a **Scale** node.
**★ Scale needs a Point (anchor) in addition to entities** — unlike Move which can free-drag; Scale is always about a fixed point.

## 6. Combine — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Combine.
**Pre-selection / prompt:** canvas hint "Select target body" → then "Select bodies to combine with target body". This is the **body-level boolean** (vs the per-feature Operation dropdown baked into Extrude/primitives).
**Dialog panel (COMBINE):**
- **Target Body** — [Select] → "1 selected" [x] (the body kept/modified; picked the box = Body1).
- **Tool Bodies** — [Select] → "N selected" [x] (the body/bodies applied to the target; picked the cylinder). Multiple tools allowed.
- **Operation** — a **3-icon segmented toggle** (NOT a dropdown here): **Join** (default) / **Cut** / **Intersect**. (Only 3 — there is no "New Body" in Combine since the result replaces/uses the target.)
- **Keep Tools** — checkbox, **default OFF** (ON = the tool bodies survive as separate bodies after the combine, instead of being consumed).
- Footer: (i) · OK (enabled once target+tools valid) · Cancel.
- **★ NO "New Component" checkbox in this build's Combine** — verified across both Join and Cut operations; only **Keep Tools** is present. (Older Fusion builds expose a New Component checkbox; this one does not.)
**On-canvas:** live boolean preview (Cut carves the cylinder out of the box, etc.). No drag manipulator — purely a selection+operation command.
**Timeline:** OK appends a **Combine** node; body count in the browser changes (tools consumed unless Keep Tools ON).

## 7. Press Pull — shortcut Q  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Press Pull (Q). The **universal direct-edit** command — one entry point that becomes different features by WHAT you pick.
**Pre-selection / prompt:** opens with a single **Selection** field, canvas hint "Select faces or edges to modify". **What you pick decides the behavior:**
- **A face** → becomes **OFFSET FACE** (push/pull the face; verified live below).
- **An edge** → becomes a **Fillet** (rounds the edge).
- **A sketch profile / closed sketch region** → becomes an **Extrude**.
- (A whole body/faces set can also be offset.)
**★ VERIFIED — picking a box face turned Press Pull into the OFFSET FACE dialog:**
- Title changes to **OFFSET FACE**.
- **Faces** — "N selected" [x].
- **Offset Type** (label "Offset T…") — dropdown, 3 options: **Modify Existing Feature** (edits the parametric feature that made the face, no new timeline node) / **New Offset** (adds a distinct Offset-Face feature) / **Automatic** (default — Fusion decides).
- **Distance** — value box (`30 mm` here; the push/pull amount).
- Footer: (i) · OK · Cancel.
**On-canvas manipulator:** the picked face gets a **drag arrow** + floating inline value box ("30 mm") — drag to push/pull live; negative flips inward.
**Timeline:** commits as an **Offset Face** (or Fillet / Extrude, per pick). With Offset Type = Modify Existing Feature it may edit an existing node instead of adding one.
**★ Press Pull = webcad's single "smart push/pull" verb** — resolve the picked entity type (face→offset, edge→fillet, profile→extrude) at pick time. The Offset Type "Modify Existing Feature vs New Offset vs Automatic" is worth mirroring for clean-history direct editing.

## 8. Move/Copy — shortcut M  [VERIFIED LIVE, all 5 modes, cancelled]
**Path:** MODIFY > Move/Copy (M).
**Pre-selection / prompt:** "Select bodies to move" (prompt text follows Move Object type).
**Dialog panel (MOVE/COPY), top rows (persist across modes):**
- **Move Object** — dropdown: **Bodies** (default) / **Faces** / **Sketch Objects**. (**"Components" appears too when the design HAS components** — this scratch design has only root bodies, so only 3 shown. So the full set is Bodies/Components/Faces/Sketch Objects as briefed.)
- **Selection** — [Select] → "N selected" [x].
- **Move Type** — a **5-icon segmented toggle** (confirmed live by field changes):
  1. **Free Move** (default) — full 6-DOF gizmo. Fields: **X/Y/Z Distance** (mm) + **X/Y/Z Angle** (deg) — all six at once. On-canvas gizmo = 3 translate arrows + 3 rotation arcs + planar drag handles.
  2. **Translate** — Fields: **Direction** dropdown {**Component XYZ** (default, object-local) / **Design XYZ** (global) / **Pick Direction** (pick an edge/axis)} + **X/Y/Z Distance**. Gizmo = 3 translate arrows only.
  3. **Rotate** — Fields: **Axis** [Select] + **Angle** (deg, appears after axis) + Create Copy. Gizmo = a rotation arc about the picked axis.
  4. **Point to Point** — Fields: **Origin Point** [Select] + **Target Point** [Select] (snaps origin pt onto target pt).
  5. **Point to Position** — Fields: **Point** [Select] + X/Y/Z position (type destination coords for the picked point).
- **Set Pivot** — an icon button (relocate the manipulator's pivot/origin without moving the object — re-anchors the gizmo).
- **Create Copy** — checkbox, **default OFF**, present in **every** mode. ON = leaves the original and moves a COPY (this is the "Copy" half of Move/Copy). Repeated OK with Create Copy = pattern-by-hand.
- Footer: (i) · OK (disabled until a non-zero move / valid picks) · Cancel.
**On-canvas manipulator:** a full **triad gizmo** — drag arrows (translate), arcs (rotate), and planar squares; each drag mirrors into the corresponding X/Y/Z Distance or Angle box (and vice-versa — typing moves the gizmo). Free Move shows all handles; Translate/Rotate show only the relevant subset.
**Timeline:** OK appends a **Move** node (or **Move (Copy)**). Moving *faces* creates a direct-edit Move-Face feature.
**★ Move/Copy is the richest MODIFY dialog — 5 sub-modes + object-type selector + copy toggle.** For webcad: one Move command with a mode switch (Free/Translate/Rotate/Pt-Pt/Pt-Pos), an object-type filter (Bodies/Components/Faces/Sketches), a re-locatable pivot, and a Create-Copy flag. Free Move's live 6-field ↔ gizmo two-way binding is the key UX.

## 9. Replace Face — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Replace Face.
**Pre-selection / prompt:** "Select faces to replace".
**Dialog panel (REPLACE FACE):**
- **Source Faces** — [Select] (the existing face(s) on the body to be replaced/healed away).
- **Tangent Chain** — checkbox, **default OFF** (extend selection along tangent faces).
- **Target Faces** — [Select] (the new face / surface body / construction plane the body is re-grown up to — the body's source faces are extended or trimmed to meet this target, healing the solid).
- Footer: (i) · OK (enabled with valid source+target) · Cancel.
**On-canvas:** live preview of the body re-shaped so its source faces lie on the target surface. No numeric field, no drag manipulator — purely two selection slots.
**Timeline:** OK appends a **Replace Face** node.
**★ Use:** reshape a solid to conform to a surface/plane (e.g. flatten a bumpy top to a plane, or wrap a face to an imported surface) — the "heal to a target surface" op.

## 10. Split Face — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Split Face. (Splits a FACE into multiple faces — does NOT cut the solid.)
**Pre-selection / prompt:** "Select Face to split".
**Dialog panel (SPLIT FACE):**
- **Faces to Split** — [Select] (the face(s) to subdivide).
- **Splitting Tool** — [Select] (a sketch curve / edge / surface / plane / another face that carves the split line onto the face).
- **Chain Selection** — checkbox, **default ON**.
- **Split Type** — dropdown, 3 options: **Split with Surface** (default — project the tool along the surface's own shape) / **Along Vector** (project the split curve along a picked vector/direction) / **Closest Point** (project by nearest point). *(This matches the mission's Surface/Along Vector/Closest Point.)*
- **Extend Splitting Tool** — checkbox, **default ON** (auto-extends the tool so it fully crosses the face, guaranteeing a clean split).
- Footer: (i) · OK · Cancel.
**Timeline:** OK appends a **Split Face** node; the face is now 2+ faces (each independently selectable/colorable) but the body volume is unchanged.

## 11. Split Body — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Split Body. (Cuts a BODY into multiple bodies.)
**Pre-selection / prompt:** "Select Body to split".
**Dialog panel (SPLIT BODY):**
- **Body to Split** — [Select] (the solid to divide).
- **Splitting Tool(s)** — [Select] (a **plane / planar face / surface / sketch**; multiple tools allowed → multi-cut).
- **Extend Splitting Tool(s)** — checkbox, **default ON** (extend the tool(s) to fully bisect the body).
- Footer: (i) · OK · Cancel.
- **NO Split Type dropdown** (that only exists on Split *Face*).
**Timeline:** OK appends a **Split Body** node; the browser **Bodies** folder gains the extra body/bodies (e.g. one body → two).
**★ Split Face vs Split Body:** Split Face keeps ONE body, just subdivides face topology (for coloring/partial-fillet/draft-region control); Split Body actually CUTS into separate bodies. Split Face has the Split Type dropdown; Split Body does not.

## 12. Align — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Align.
**Pre-selection / prompt:** "Select geometry or snap point on alignable object".
**Dialog panel (ALIGN):**
- **Object** — dropdown: **Bodies** (default) / Components / Faces (same object-type family as Move/Copy).
- **From** — [Select] (a **point / edge / face** ON the object being aligned = the reference that will be moved).
- **To** — [Select] (the **destination point / edge / face** the From geometry snaps onto). The object translates/rotates so From coincides with To.
- Footer: (i) · OK · Cancel.
**On-canvas:** pick From geometry then To geometry; live preview snaps the object. Point→Point aligns a point; Face→Face makes faces coplanar/mating; Edge→Edge aligns edges. (It's a quick mate-style align without full assembly joints.)
**Timeline:** OK appends an **Align** node.

## 8/15. Offset Face (standalone MODIFY item) — [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Offset Face. **Identical dialog to the one Press Pull morphs into** (see §7): opens with just **Faces** [Select] ("Select face(s) to offset"); once a face is picked it reveals **Offset Type** {Modify Existing Feature / New Offset / Automatic} + **Distance** value box + a drag-arrow manipulator. So Offset Face exists both as its own command AND as the face-branch of Press Pull.

## 13/15. Silhouette Split — (no default shortcut)  [VERIFIED LIVE, cancelled]
**Path:** MODIFY > Silhouette Split.
**Pre-selection / prompt:** "Select plane or axis for the pull direction".
**Dialog panel (SILHOUETTE SPLIT):**
- **View Direction** — [Select] (a plane / axis / face defining the viewing/pull direction whose silhouette is projected).
- **Target Body** — [Select] (the body to split along its silhouette outline as seen from that direction).
- **Operation** — dropdown, 3 options: **Split Faces Only** (just adds split edges on faces) / **Split Shelled Body** (default) / **Split Solid Body** (cuts the solid at the silhouette).
- Footer: (i) · OK · Cancel.
**Use:** create parting-line splits at the silhouette of a body relative to a mold-open direction (draft/tooling prep). **Timeline:** appends a Silhouette Split node.

## 14/11. Delete — shortcut Del  [VERIFIED LIVE (face delete observed)]
**Path:** MODIFY > Delete (Del). Also on the **body right-click context menu** (verified: Body context menu lists **Delete (Del)** with a red-X icon, distinct from **Remove**).
**Behavior is context-sensitive to WHAT is selected:**
- **Delete a FACE** → an immediate **Delete-Face / defeature** action (**no modal dialog** in this build — it just executes). It removes the face and tries to **heal** the body by extending the neighbouring faces. On the box's flat side face this **errored** (a flat box face has no way to heal into a closed solid → flagged an error indicator). It succeeds when the face is removable-and-healable (e.g. deleting a fillet/chamfer face un-rounds the edge; deleting a boss face heals flat).
- **Delete a BODY** → removes the entire body from the design (hard delete of that body/its result). Context-menu entry with red-X.
- **Delete an edge / feature / sketch** → removes that entity (deleting a timeline feature ripples downstream).
- Reversible with Ctrl+Z. **★ CAUTION captured live:** after a failed face-delete, a single Ctrl+Z stepped the history back INTO an existing sketch's edit mode (had to click **Finish Sketch** to exit) — the undo stack can cross the feature/sketch boundary; webcad's undo should not silently re-enter sub-editors.

## 15b. Remove — (no default shortcut)  [VERIFIED presence; body context menu + MODIFY item]
**Path:** MODIFY > Remove. Also on the **body right-click context menu** (its own entry, separate from Delete, with a blue icon).
**Distinction from Delete (the key point):** **Remove is a PARAMETRIC direct-edit feature** — it removes faces/bodies and heals, and records a **Remove node in the Timeline** (reversible, history-preserving), whereas **Delete** is an immediate hard removal. Remove is the "clean" way to take faces/bodies out of imported/base-feature or direct-edit geometry while keeping the model tree intact. Its dialog = a **selection of faces/bodies to remove** (+ heal) — minimal; like a persistent Delete-Face. (On a box's flat face it would likewise fail to heal; not driven to commit to avoid mangling scratch geometry.)
Only **Press Pull (Q)**, **Fillet (F)**, **Move/Copy (M)**, **Delete (Del)**, **Appearance (A)**, **Compute All (Ctrl+B)** show shortcuts. NOTE: **Offset Face** is a first-class MODIFY menu item here (mission item #15); **Remove** and **Silhouette Split** also present as their own items; **Boundary Fill** is NOT in MODIFY (it lives in CREATE per solid spec).

---
