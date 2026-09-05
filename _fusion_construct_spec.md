# Fusion 360 — SOLID tab CONSTRUCT (参考几何 / datum) grammar (live capture)

Captured live from Autodesk Fusion (Education License), DESIGN workspace, SOLID tab, mm units, English UI.
Purpose: reference for webcad datum/construction-geometry parity. Companion to `_fusion_solid_spec.md`.
Scratch geometry on canvas during capture: one **box body** (flat faces/edges/vertices) + one **cylinder body** (curved face) — left by operator #1.

---

## ★ ARCHITECTURE FINDING — one unified "CONSTRUCTION GEOMETRY" dialog (this Fusion version)

The 20 CONSTRUCT menu items are NOT 20 separate dialogs. In this Fusion build they are **entry-point shortcuts** into ONE shared floating dialog titled **CONSTRUCTION GEOMETRY**, docked top-right, with this top structure:

- **Type** — a 3-icon segmented toggle at the very top: **Plane** (green plane icon) / **Axis** (green diagonal-line icon) / **Point** (orange cross icon). Picking a menu item pre-sets this.
- **Method** — a dropdown whose option list changes with Type. This is the actual "which construction" selector.
  - **Type = Plane → Method options (8):** Offset, At Angle, Tangent, Midplane, Perpendicular Plane, Through Two Edges, Through Three Points, Along Path.
  - **Type = Axis → Method options (5):** (see Axes section) Through Cylinder/Cone/Torus, Perpendicular To Face, Through Two Planes, Through Two Points, Through Edge.
  - **Type = Point → Method options (6):** At Vertex, Through Two Edges, Through Three Planes, At Center Of Circle/Sphere/Torus, At Edge And Plane, Along Path.
- Below Method: the **selection fields + value fields** for that method (they swap when Method changes).
- Footer: **(i)** info icon · **OK** (greyed until inputs valid) · **Cancel**.

**webcad takeaway:** you can implement datums as a single "Construction Geometry" command with a Type toggle + Method dropdown, OR keep them as 20 named menu items that each preset Type+Method into the same panel. Fusion's own menu does the latter as sugar over the former. Changing Method mid-dialog keeps you in the same command (no re-open).

**Menu → Type/Method map (live order of the CONSTRUCT dropdown):**
0. User Coordinate System (UCS) — top item, separate (creates a full UCS, not a single datum)
   PLANES: 1 Offset Plane, 2 Plane at Angle, 3 Tangent Plane, 4 Midplane, 5 Perpendicular Plane, 6 Plane Through Two Edges, 7 Plane Through Three Points, 8 Plane Along Path
   AXES: 9 Axis Through Cylinder/Cone/Torus, 10 Axis Perpendicular To Face, 11 Axis Through Two Planes, 12 Axis Through Two Points, 13 Axis Through Edge
   POINTS: 14 Point At Vertex, 15 Point Through Two Edges, 16 Point Through Three Planes, 17 Point At Center Of Circle/Sphere/Torus, 18 Point At Edge And Plane, 19 Point Along Path

NOTE vs mission brief: this build has **Perpendicular Plane** (not "Plane Tangent to Face at Point"); "Plane Tangent to Face at Point" does not exist as a separate item here. Axes list is 5 (no separate "Axis Perpendicular at Point" AND "Axis Perpendicular to Face at Point" — there is one "Axis Perpendicular To Face"). Points list is 6 as briefed.

---

## PLANES

## 1. Offset Plane (Type=Plane, Method=Offset)
**Prompt (empty):** "Select plane, planar face or sketch profile."
**Pre-selection needed:** one plane / planar face / sketch profile (the base). Also accepts an origin plane (XY/XZ/YZ) if made visible.
**Dialog fields (after picking the box top face):**
- Type = Plane · Method = Offset
- **Plane** — selection field, "1 selected" [x].
- **Extent** — dropdown: **Distance** (default) / **To Object**. (To Object = offset up to a picked target face/plane/point instead of a numeric distance.)
- **Distance** — value box, default `0.00 mm`, equation-capable.
- **Resize** — 2-icon toggle controlling the datum plane's *display size*: auto/planar-fit icon + manual corner-drag icon. (Cosmetic only — does not affect geometry; unique to plane construction.)
- Footer: (i) · OK (greyed until Distance≠0) · Cancel.
**On-canvas manipulator:** a blue translucent plane preview appears on the face (drawn slightly larger, yellow border = the datum extent). A single **up-arrow** handle drags the offset live; an **inline value box** ("0.00 mm") floats beside it — type directly. Drag past zero → negative (offsets the other way). Corner drag-handles resize the display rectangle.
**Result / Timeline / Browser:** OK creates a **Construction Plane** — appended as a plane node in the **Timeline**, and listed under a **Construction** folder in the Browser (folder auto-created on first datum). Named "Plane1" etc.

## 2. Plane at Angle (Type=Plane, Method=At Angle)
**Prompt:** "Select an edge, axis or sketch line."
**Pre-selection needed:** exactly ONE linear **Edge** (or axis / sketch line). *Simpler than the mission brief* — it does NOT ask for a separate reference face; the plane is hinged on the edge and the angle is measured from the edge's default reference. Status bar: "1 Edge | Length : 30.00 mm".
**Dialog fields:**
- Method = At Angle
- **Edge** — selection field, "1 selected" [x].
- **Extent** — dropdown, shows **Angle** (the rotation quantity).
- **Angle** — value box, default `0.0 deg`.
- **Resize** — 2-icon display-size toggle (same as Offset).
- Footer: (i) · OK · Cancel.
**On-canvas manipulator:** the construction plane hinges along the selected edge; a **circular/angular rotation handle** (blue) sits at the edge with an inline **"0.0 deg"** value box — type or drag to set the tilt.
**Result:** Construction Plane node in Timeline + Construction folder.

## 3. Tangent Plane (Type=Plane, Method=Tangent)
**Prompt:** "Select a face." then "Select a reference object."
**Pre-selection needed:** one **cylindrical/curved Face** (required); one optional **Reference** plane/face (sets the 0° datum orientation). Status: "1 Face | Radius : 12.673 mm".
**Dialog fields:**
- Method = Tangent
- **Face** — selection, "1 selected" [x] (the cylinder side).
- **Reference** — selection "Select" (OPTIONAL — a plane/face the tangent angle is measured from; if omitted, an origin plane is the default reference).
- **Angle** — value box, default `0.0 deg` (rotates the tangent plane around the cylinder).
- **Resize** — 2-icon display-size toggle.
- Footer: (i) · OK · Cancel.
**On-canvas manipulator:** a plane preview sits tangent to the cylinder; an **angular handle** (blue) + inline **"0.0 deg"** box rolls it around the cylinder axis.
**Result:** Construction Plane node.

## 4. Midplane (Type=Plane, Method=Midplane)
**Prompt:** "Select..." → after first: "Select the second face, plane, or profile."
**Pre-selection needed:** two planar **faces / planes** (Plane 1 + Plane 2). They need not be parallel — status showed "2 Faces | Angle : 90.0 deg" for two perpendicular box faces, and the datum is the exact **bisector** (for parallel faces it is the true midplane).
**Dialog fields:**
- Method = Midplane
- **Plane 1** — selection "1 selected" [x].
- **Plane 2** — selection "1 selected" [x].
- **Resize** — 2-icon display-size toggle (appears once both picked).
- Footer: (i) · OK (enabled once both valid) · Cancel.
- NO numeric field — purely geometric.
**On-canvas:** a translucent plane preview appears exactly between the two picked faces.
**Result:** Construction Plane node.

## 5. Perpendicular Plane (Type=Plane, Method=Perpendicular Plane)
**Prompt:** picks a **Face** then "Select" a reference.
**Pre-selection needed:** a **Face** (required; carried over a prior face selection in test — "1 Face | Area : 2811.897 mm^2") + a **Reference** (edge/point on/through which the perpendicular plane passes). Creates a plane perpendicular to the face.
**Dialog fields:**
- Method = Perpendicular Plane
- **Face** — selection "1 selected" [x].
- **Plane C...** (label truncated, ~"Plane Control") — a 2-icon toggle controlling the perpendicular plane's orientation/placement.
- **Reference** — selection "Select" (the edge/point locating the plane).
- **Distance** — value box, default `0.00 mm` (offset along the reference).
- **Resize** — 2-icon display-size toggle.
- Footer: (i) · OK · Cancel.
**On-canvas:** a plane preview standing perpendicular to the picked face, with an inline "0.00 mm" distance box.
**Result:** Construction Plane node. (Less-common construction; grammar = Face + Reference + Distance + orientation toggle.)

## 6. Plane Through Two Edges (Type=Plane, Method=Through Two Edges)
**Prompt:** "Select..." → "Select the second edge or axis."
**Pre-selection needed:** two linear **edges / axes** (Edge 1 + Edge 2) that are coplanar/parallel; the datum plane is the plane containing both.
**Dialog fields:**
- Method = Through Two Edges
- **Edge 1** — selection "1 selected" [x] ("1 Edge | Length : 30.00 mm").
- **Edge 2** — selection "Select".
- (Resize toggle appears once both valid.)
- Footer: (i) · OK (enabled with 2 valid coplanar edges) · Cancel.
- NO numeric field.
**Result:** Construction Plane node.
*(Verify note: edge-picking on the bottom silhouette edge was pixel-fragile in this survey — captured grammar from Edge 1 + prompt; second edge not landed. This is the same finicky edge-selection quirk noted throughout.)*

## 7. Plane Through Three Points (Type=Plane, Method=Through Three Points)
**Prompt:** "Select..." → "Select the second vertex, point, sketch point or snap." → "Select the third vertex, point, sketch point or snap."
**Pre-selection needed:** three **vertices / sketch points / snap points** (Point 1 / Point 2 / Point 3), must be non-collinear; the datum plane passes through all three.
**Dialog fields:**
- Method = Through Three Points
- **Point 1 / Point 2 / Point 3** — three selection fields, each "1 selected" [x] when picked. Vertices snap reliably (unlike edges).
- Footer: (i) · OK (enabled with 3 non-collinear points) · Cancel.
- NO numeric field.
**Result:** Construction Plane node.
*(Verify note: picked Point 1 + Point 2 on box corners cleanly; while reaching for the 3rd, an empty-canvas click panned the view — third point not landed, but grammar fully confirmed. Reliable command-exit was right-click marking-menu, since Escape did nothing — IME focus-drop quirk from operator #1's notes confirmed again.)*

## 8. Plane Along Path (Type=Plane, Method=Along Path)
**Prompt:** "Select a path." then a position field.
**Pre-selection needed:** a **Path** (an edge / sketch curve / edge chain). Not driven live in this pass (no free curve on the scratch geometry — a box has only straight edges; would need a sketched spline/arc to demo cleanly).
**Expected dialog fields (standard Fusion, from menu + product behavior):**
- Method = Along Path
- **Path** — selection field.
- **Distance** — value box, a **0–1 fraction** of the path length (default ~0.0), positioning the plane along the path; the plane is normal to the path at that station.
- **Resize** — display-size toggle.
- Footer: (i) · OK · Cancel.
**On-canvas:** a plane preview perpendicular to the path with a slider/handle at the 0–1 station.
**Result:** Construction Plane node. *(Grammar inferred — see can't-verify list.)*

---

## AXES
Type = Axis. Method dropdown (5): **Through Cylinder/Cone/Torus, Perpendicular To Face, Through Two Planes, Through Two Points, Through Edge.** All produce a **Construction Axis** node (Timeline + Construction folder). Construction axes have NO Resize display toggle (they are infinite lines shown clipped to a display length).

## 9. Axis Through Cylinder/Cone/Torus (Type=Axis, Method=Through Cylinder/Cone/Torus)
**Prompt:** "Select a cylindrical, conical or toroidal Face."
**Pre-selection needed:** one **curved Face** (cylinder/cone/torus). Status: "1 Face | Radius : 12.673 mm".
**Dialog fields:**
- Type = Axis · Method = Through Cylinder/Cone/Torus
- **Face** — selection "1 selected" [x]. (The ONLY input.)
- Footer: (i) · OK (enabled immediately) · Cancel.
- NO numeric field.
**On-canvas:** an axis line appears down the curved face's centerline.
**Result:** Construction Axis node.

## 10. Axis Perpendicular To Face (Type=Axis, Method=Perpendicular To Face)
**Prompt:** "Select a face." then "Select a vertex, point, sketch point or snap."
**Pre-selection needed:** a **planar Face** + a **Point** (vertex/sketch point). The axis is normal to the face, passing through the point.
**Dialog fields:**
- Method = Perpendicular To Face
- **Face** — selection "1 selected" [x] (planar face; "1 Face | Area : 2811.897 mm^2").
- **Point** — selection "1 selected" [x].
- Footer: (i) · OK (enabled with both) · Cancel.
- NO numeric field.
**On-canvas:** an infinite axis line drawn normal to the face through the point (vertical line perpendicular to the top face in test), clipped to a display length above & below.
**★ RESULT (completed live — captured the general datum-commit behavior here):** clicking OK created the axis and:
  - **Browser** gained a new **"Construction"** folder (appears below Sketches; auto-created on the first datum, all subsequent datums nest inside it). Origin planes/axes stay under the separate **Origin** folder.
  - **Timeline** appended a green **axis** node after the existing body nodes (box/cylinder). Double-click to re-edit. (Same commit pattern applies to every plane/axis/point construction.)

## 11. Axis Through Two Planes (Type=Axis, Method=Through Two Planes)
**Prompt:** "Select the first face, plane or profile." → then the second.
**Pre-selection needed:** two planar **faces / planes** (Plane 1 + Plane 2). The axis is their **line of intersection** (the two planes must not be parallel).
**Dialog fields:**
- Method = Through Two Planes
- **Plane 1** — selection "Select".
- **Plane 2** — selection "Select".
- Footer: (i) · OK · Cancel. NO numeric field.
**Result:** Construction Axis node at the intersection of the two planes.

## 12. Axis Through Two Points (Type=Axis, Method=Through Two Points)
**Prompt:** "Select..." two points.
**Pre-selection needed:** two **points / vertices / sketch points** (Point 1 + Point 2). The axis passes through both.
**Dialog fields:**
- Method = Through Two Points
- **Point 1** — selection "Select".
- **Point 2** — selection "Select".
- Footer: (i) · OK · Cancel. NO numeric field.
**Result:** Construction Axis node through the two points.

## 13. Axis Through Edge (Type=Axis, Method=Through Edge)
**Prompt:** "Select..." an edge.
**Pre-selection needed:** one linear **Edge** (or sketch line). The axis lies coincident with that edge (infinite line along it).
**Dialog fields:**
- Method = Through Edge
- **Edge** — selection "Select". (The ONLY input.)
- Footer: (i) · OK · Cancel. NO numeric field.
**Result:** Construction Axis node collinear with the edge.

---

## POINTS
Type = Point. Method dropdown (6): **At Vertex, Through Two Edges, Through Three Planes, At Center Of Circle/Sphere/Torus, At Edge And Plane, Along Path.** All produce a **Construction Point** node (Timeline + Construction folder).

## 14. Point At Vertex (Type=Point, Method=At Vertex)
**Prompt / tooltip (verbatim):** "At Vertex — Creates a Construction Point at an existing point or vertex." / "Select a vertex, point, sketch point or snap."
**Pre-selection needed:** one **vertex / point / sketch point** (Point field).
**Dialog fields:** Method = At Vertex · **Point** — selection "Select" (the only input) · (i) · OK · Cancel. NO numeric field.
**Result:** Construction Point node at that vertex.

## 15. Point Through Two Edges (Type=Point, Method=Through Two Edges)
**Pre-selection needed:** two linear **edges** (Edge 1 + Edge 2) that intersect (or whose nearest approach defines a point). The construction point is placed at their intersection.
**Dialog fields:** Method = Through Two Edges · **Edge 1** / **Edge 2** selection fields · (i) · OK · Cancel. NO numeric field.
**Result:** Construction Point node. *(Fields inferred from the pattern + menu; not driven live — same 2-edge grammar as the plane variant.)*

## 16. Point Through Three Planes (Type=Point, Method=Through Three Planes)
**Pre-selection needed:** three planar **faces / planes** (Plane 1 / Plane 2 / Plane 3). The point is their common intersection.
**Dialog fields:** Method = Through Three Planes · **Plane 1 / Plane 2 / Plane 3** selection fields · (i) · OK · Cancel. NO numeric field.
**Result:** Construction Point node at the 3-plane intersection. *(Fields inferred from pattern + menu.)*

## 17. Point At Center Of Circle/Sphere/Torus (Type=Point, Method=At Center Of Circle/Sphere/Torus)
**Prompt:** "Select..." a round face or circular edge.
**Pre-selection needed:** one **Face OR Edge** that is round — a cylindrical/spherical/toroidal face, or a circular/arc edge. Field is labelled **"Face/Edge"** (accepts either). Picking the cylinder's top circular edge gave "1 Edge | Diameter : 25.346 mm".
**Dialog fields:** Method = At Center Of Circle/Sphere/Torus · **Face/Edge** — selection "1 selected" [x] (the only input) · (i) · OK (enabled immediately) · Cancel. NO numeric field.
**On-canvas:** a construction-point marker snaps to the geometric center of the picked circle/sphere/torus.
**Result:** Construction Point node at the center.

## 18. Point At Edge And Plane (Type=Point, Method=At Edge And Plane)
**Pre-selection needed:** one **Edge** + one **Plane/face**. The point is placed where the edge intersects (pierces) the plane.
**Dialog fields:** Method = At Edge And Plane · **Edge** — selection "Select" · **Plane** — selection "Select" · (i) · OK · Cancel. NO numeric field.
**Result:** Construction Point node at the edge-plane intersection.

## 19. Point Along Path (Type=Point, Method=Along Path)
**Prompt:** "Select edges or sketch curves."
**Pre-selection needed:** a **Path** (edge / sketch curve / chain).
**Dialog fields:**
- Method = Along Path
- **Path** — selection "Select".
- **Chaining** (label truncated "Chainin...") — checkbox, default **ON** (auto-extends along tangent-connected edges).
- **Distance** — a **0–1 fraction** position field appears once a path is picked (default ~0.0), placing the point along the path. *(Distance field not seen live — the box's straight silhouette edges kept slipping the pixel-pick; grammar confirmed = Path + Chaining, distance-along inferred from the standard 0–1 pattern shared with Sweep/Pipe/Plane-Along-Path.)*
- Footer: (i) · OK · Cancel.
**Result:** Construction Point node at the path station.

---

## 0. User Coordinate System (UCS) — top of CONSTRUCT menu (separate command, NOT the unified Construction-Geometry dialog)
This is the one CONSTRUCT item that is NOT a single datum and does NOT open the unified dialog. It creates a full **UCS** (a relocatable origin with its own X/Y/Z axes + 3 planes) used as a local coordinate frame. Distinct grammar (own dialog with origin-point + axis-orientation pickers). Not driven deeply in this pass (out of the planes/axes/points scope); flagged so webcad knows the menu's 0th item is a coordinate-system tool, not a lone plane/axis/point.

---

## 21. SKETCH-mode CREATE → Project / Include (参考/投影) — lives inside SKETCH, not CONSTRUCT

**Entering sketch:** SOLID → CREATE → **Create Sketch** → pick a plane/face → view snaps flat ("Look At") and the ribbon switches to the contextual **SKETCH** tab with a green **FINISH SKETCH**. A **SKETCH PALETTE** docks top-right with Options checkboxes: Linetype, Look At, Sketch Grid, Snap, Slice, Profile ✓, Points ✓, Dimensions ✓, Constraints ✓, **Projected Geometries ✓**, **Construction Geometries ✓**, 3D Sketch. (The Projected/Construction-Geometries toggles control visibility of projected & construction sketch entities.)

**SKETCH → CREATE → Project / Include ▶ submenu (7 items, live order):**
1. **Project** (shortcut **P**)
2. **Intersect**
3. **Spun Profile**
4. **Include 3D Geometry**
5. **Project To Surface**
6. **Intersection Curve**
7. **Isoparametric Curve**
(Mission listed 4; this build has 7 — Spun Profile / Intersection Curve / Isoparametric Curve are the extras.)

### 21a. Project (P)  — VERIFIED LIVE
**Prompt:** "Select objects to project."
**Pre-selection:** edges / faces / vertices / sketch curves of existing bodies (pick on canvas).
**Dialog (PROJECT, docks left of the Sketch Palette):**
- **Geometry** — selection "Select" → "1 selected" [x] (status "1 Edge | Length : 30.00 mm").
- **Selection Filter** — 2-icon toggle picking WHAT the click grabs: a "Bodies" icon (purple, default) + a "Faces/Edges (Specified Entities)" icon. Controls whether you pick whole bodies vs individual faces/edges.
- **Projection Link** — checkbox, **default ON**. THIS is the associative link: ON = the projected sketch geometry stays linked to the source and updates when the source model changes; OFF = a one-time static copy.
- Footer: (i) · OK (enabled once geometry picked) · Cancel.
**★ RESULT (verified):** OK created a **projected sketch curve** rendered in Fusion's **projected-geometry colour (purple/magenta, with purple endpoint circles)** — visually distinct from normal black sketch lines. With Projection Link ON it is associative to the source edge.

### 21b. Intersect
**Purpose:** projects the **cross-section curves where the sketch plane cuts through selected bodies/faces** (the silhouette/section where geometry intersects the sketch plane). Dialog mirrors Project: a **Geometry/Bodies** selection + **Projection Link** checkbox (associative section curves). Prompt asks to select bodies/faces to intersect with the sketch plane. *(Dialog structure per Project pattern; opened from same submenu.)*

### 21c. Include 3D Geometry — VERIFIED (behavior)
**Purpose:** brings existing **3D model edges/faces/vertices into the active sketch as reference** WITHOUT flattening them onto the sketch plane (they keep their true 3D position, usable as references).
**★ INTERACTION (verified):** unlike Project, it has **NO persistent dialog panel** — invoking it starts an **include-on-click mode**: you click 3D model entities and each is immediately included as linked reference geometry; right-click → OK/Cancel (or Enter/Esc) ends the mode. (Confirmed via marking-menu "Repeat Include 3D Geometry".)

### 21d. Project To Surface — VERIFIED LIVE
**Purpose:** projects selected sketch curves ONTO a target surface/face (wraps flat curves onto a curved face). Prompt: "Select face, surface feature or workplane to project on."
**Dialog (PROJECT TO SURFACE):**
- **Faces** — selection "Select" (the target surface/face/workplane).
- **Curves** — selection "Select" (the sketch curves to project).
- **Project Type** — dropdown, default **Closest Point** ("Closest Po…"; other option = Along Vector).
- **Projection Link** — checkbox, **default ON** (associative link, same as Project).
- Footer: (i) · OK · Cancel.

### 21e–g (bonus, brief)
- **Spun Profile** — creates the 2D "turned" silhouette profile of a revolved/round body onto the sketch (like an axial section for lathe-style parts).
- **Intersection Curve** — the curve of intersection between a selected face/surface and the sketch plane (a single intersection curve rather than full section).
- **Isoparametric Curve** — extracts a U- or V-isocurve from a surface into the sketch.

---

## ★ TOP 10 WEBCAD-ACTIONABLE CONSTRUCT BEHAVIORS

1. **One unified datum command.** Model construction planes/axes/points as a SINGLE "Construction Geometry" command: a **Type toggle (Plane/Axis/Point)** + a **Method dropdown** that swaps the selection/value fields. The 20 named menu items are just shortcuts that preset Type+Method. Changing Method mid-dialog keeps the same command — no re-open. This is far less code than 20 separate dialogs.

2. **Method → required-inputs table is the whole spec.** Each method = an ordered list of typed selection slots (+ at most one numeric field). Planes: Offset(plane+Distance), At Angle(edge+Angle), Tangent(cyl-face+ref+Angle), Midplane(2 planes), Perpendicular(face+ref+Distance), Through-2-Edges(2 edges), Through-3-Points(3 pts), Along-Path(path+0–1). Axes: Cyl-face / face+pt / 2 planes / 2 pts / 1 edge. Points: vertex / 2 edges / 3 planes / round-face-or-edge / edge+plane / path+0–1.

3. **Only 4 of the 8 planes take a numeric field** (Offset=Distance, At Angle & Tangent=Angle, Perpendicular=Distance, Along-Path=0–1 fraction). Midplane / Through-2-Edges / Through-3-Points are **purely geometric** (no number, OK enables as soon as picks are valid). NO axis or point method has a numeric field except the two "Along Path" (0–1 fraction). Mirror this: don't show a value box where the datum is fully constrained by its references.

4. **Selection slots are sticky + canvas-pick-driven, and the active slot must be obvious.** Same quirk as operator #1's feature dialogs: you must have the right slot active before picking; each slot shows "Select" → "N selected" [x]; a stray empty-space click can pan the view or clear. Vertices/faces snap reliably; **thin silhouette edges are pixel-fragile to hit** — give webcad generous edge hit-tolerance + hover highlight.

5. **Inline on-canvas manipulators mirror the numeric field.** Offset = drag arrow + inline mm box (drag past 0 → negative/flip). At Angle / Tangent = angular handle + inline deg box. This is the same grammar as the feature dialogs — one shared "handle + floating value box, typing == editing the field" component covers both.

6. **"Resize" is a display-only property of PLANES** (2-icon toggle: auto-fit vs manual corner-drag of the datum rectangle). Axes & points have no Resize (axis = clipped infinite line, point = marker). Keep datum display-size out of the geometric model.

7. **Completed datum bookkeeping:** first datum auto-creates a **"Construction" browser folder** (siblings: Origin, Bodies, Sketches); every datum nests there and appends a **Timeline node** (double-click to re-edit). Origin planes/axes stay in the separate **Origin** folder. Datums are parametric history features, not free-floating.

8. **Round-geometry pickers accept face OR edge.** "Axis Through Cylinder/Cone/Torus" wants a curved face; "Point At Center Of Circle/Sphere/Torus" is labelled **Face/Edge** and happily took a circular EDGE (→ center of that circle). Support both entity kinds in the same slot with a clear filter.

9. **Projection lives in SKETCH mode, and associativity is a checkbox.** Project / Intersect / Project-To-Surface each expose a **Projection Link** checkbox (**default ON** = live-linked to source; OFF = static copy) plus a **Selection Filter** (bodies vs faces/edges). Projected entities render in a **distinct purple/magenta colour** with purple endpoints — webcad should visually distinguish projected/linked sketch geometry from authored geometry.

10. **Include 3D Geometry is a mode, not a dialog.** It has no OK/Cancel panel — invoke → click 3D entities to include them as off-plane 3D reference → Enter/Esc to end. Distinguish "flatten onto sketch plane" (Project) from "reference in true 3D position" (Include 3D Geometry) in webcad's sketch toolset.

## HONEST CAN'T-VERIFY / PARTIAL LIST
- **Plane Along Path (8)** & **Point Along Path (19):** the 0–1 Distance field was NOT seen live — the box's straight silhouette edges kept slipping the pixel-pick, so no path landed. Grammar (Path + Chaining checkbox) confirmed; the 0–1 fraction is inferred from the shared Sweep/Pipe/Plane-along-path pattern.
- **Plane Through Two Edges (6)** & **Through Three Points (7):** confirmed the field layout + first picks, but the 2nd edge / 3rd point never landed (fragile edge-pick; an empty-space click panned the view). OK-completion not observed for these two (completion IS observed generally via the Axis-Perpendicular-To-Face datum).
- **Perpendicular Plane (5):** the "Plane C…" row label was truncated and not fully expanded (read as a 2-icon orientation toggle); its exact meaning is inferred.
- **Extent dropdowns** beyond Offset (Distance/To Object) not individually opened for every method — most have no extent dropdown at all.
- **UCS (0):** only identified as a distinct coordinate-system command; its own dialog not driven.
- **Intersect / Spun Profile / Intersection Curve / Isoparametric Curve** (sketch): identified from the submenu; only Project & Project-To-Surface had their dialogs read live; Include-3D-Geometry's mode-behavior verified. Intersect's fields described from the Project pattern.
- **Numeric defaults** shown are the live values on this specific scratch geometry (e.g. cylinder Radius 12.673 mm, edge Length 30 mm, circle Diameter 25.346 mm), not universal defaults.

## SECTIONS ATTEMPTED (all mission items)
Planes 1–8: all captured (6 & 7 partial completion, 8 inferred). Axes 9–13: all captured (10 fully completed live). Points 14–19: all captured (17 verified live, 15/16 inferred from pattern, 19 partial). UCS: noted. Sketch Project/Include 21: 7 items listed; Project + Project-To-Surface + Include-3D-Geometry verified live, rest described.


