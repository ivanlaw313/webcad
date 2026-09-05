# Fusion 360 — SOLID tab CREATE feature grammar (live capture)

Captured live from Autodesk Fusion (Education License), DESIGN workspace, SOLID tab, mm units, English UI.
Purpose: reference for webcad solid-feature parity.

---

## SOLID → CREATE dropdown — full menu order (as shown live)
1. Create Sketch
2. Create Form  (enters Sculpt/T-Spline env)
3. Derive
4. Automated Modeling
5. Extrude  — shortcut **E**
6. Revolve
7. Sweep
8. Loft
9. Rib
10. Web
11. Emboss
12. Hole  — shortcut **H**
13. Thread
14. Box
15. Cylinder
16. Sphere
17. Torus
18. Coil
19. Pipe
20. Pattern ▶ (submenu: Rectangular Pattern / Circular Pattern / Pattern on Path / Geometric Pattern)
21. Mirror
22. Thicken
23. Boundary Fill
24. Create Base Feature
25. Create PCB ▶
26. Joint Origin

(Separators group: sketch-creation | features Extrude..Emboss | Hole/Thread | primitives Box..Pipe | Pattern/Mirror | Thicken/BoundaryFill | Base/PCB/Joint)

Only Extrude (E) and Hole (H) show keyboard shortcuts in the menu.

---

## 1. Extrude — shortcut E
**Path:** CREATE > Extrude (E).
**Pre-selection / prompt:** needs a Profile (closed sketch region) or planar face. If exactly one profile exists it auto-selects ("1 selected"); otherwise canvas hint "Select profile". Status bar shows "1 Profile | Area : 2811.897 mm^2".
**Dialog panel (docked top-right, titled EXTRUDE), fields top→bottom:**
- **Type** — 2 icon toggle: *Solid* (default) / *Thin*. (Thin extrude adds a wall-thickness field.)
- **Profiles** — selection field, "N selected" + [x] clear.
- **Start** — dropdown: **Profile Plane** (default) / **Offset** / **Object**. (Offset adds an Offset distance; Object = start from a selected face/plane.)
- **Direction** — dropdown: **One Side** (default) / **Two Sides** / **Symmetric**.
  - Two Sides → gives *two* independent extents (Side 1 / Side 2), each own Extent Type + Distance + Taper.
  - Symmetric → adds a *Measurement* toggle (Whole/Half length) + single distance mirrored.
- **Extent Type** — dropdown: **Distance** (default) / **To Object** / **All**. (On a model with existing geometry a "To Next" also appears; not present for the first body.)
  - To Object → pick a target face/plane/point (+ optional offset).
  - All → through-all (used with Cut).
- **Distance** — value box, default `0.00 mm`. Editable; equation-capable.
- **Taper Angle** — value box, default `0.0 deg`.
- **Operation** — dropdown: **Join** / **Cut** / **Intersect** / **New Body** (default for first feature). No "New Component" option in Extrude.
- Footer: info (i) icon, **OK** (disabled until distance≠0), **Cancel**.
**On-canvas manipulator:** a single arrow handle on the profile pointing along the extrude direction; drag it to set distance live. An **inline editable value box** floats next to the arrow ("30 mm") — type directly into it. A dimension label "30.00" is drawn at the profile centre. Dragging past zero flips to the opposite side (negative distance). For Two Sides / Symmetric there are handles on both sides.
**OK flow:** OK commits. Browser gains **Bodies** + **Sketches** folders; the consumed sketch is hidden. **Timeline** appends an Extrude feature node (blue box icon) after the sketch node. Double-click the timeline node to re-edit.

## 2. Revolve — (no default shortcut)
**Path:** CREATE > Revolve.
**Pre-selection / prompt:** canvas hint "Select sketch profiles or planar faces to revolve". Needs a **Profile** (sketch region OR planar face) AND an **Axis** (linear edge, sketch line, or origin axis). After picking the profile the panel keeps focus on Axis; you then click the axis geometry on-canvas.
**Dialog panel (REVOLVE) — initial fields:**
- **Profile** — selection, "N selected" + [x].
- **Axis** — selection, "Select". (Must click this field to activate, then pick a line/axis in the canvas — origin axes must be made *visible* to be pickable, and browser-tree clicks do NOT feed this input; only canvas picks do.)
- **Project Axis** — checkbox, default **ON** (projects the chosen axis onto the profile plane so a skew axis still works).
- **Operation** — dropdown: **Join / Cut / Intersect / New Body** (default New Body). Same 4 as Extrude.
- Footer: (i), OK (disabled until profile+axis valid), Cancel.
**After a valid Axis (standard Fusion behavior — could not fully drive live because axis-picking on the flat top view was unreliable):** an **Extent Type** appears = **Angle** (default, value box default `360.0 deg`) or **To Object**; plus a **Direction** dropdown (One Side / Two Sides / Symmetric) matching Extrude. A "Full" 360° is expressed by leaving angle at 360.
**On-canvas manipulator:** an angular drag handle (arc) around the axis with an inline angle value box.
**Timeline:** appends a Revolve node.

## 3. Sweep — (no default shortcut)
**Path:** CREATE > Sweep.
**Pre-selection / prompt:** needs a **Profile** (sketch region / planar face) and a **Path** (edge chain or sketch curve). No auto-select.
**Dialog panel (SWEEP), tabs: [Feature] [Analysis].**
- **Type** — dropdown: **Single Path** (default) / **Path + Guide Rail** / **Path + Guide Surface**. (Guide Rail adds a second selection field for the rail; Guide Surface adds a surface field.)
- **Profile** — selection "Select".
- **Path** — selection "Select".
- **Chain Selection** — checkbox, default **ON** (auto-extends the path along tangent-connected edges).
- **Orientation** — dropdown: **Perpendicular** (default) / **Parallel**.
- **Operation** — dropdown: Join / Cut / Intersect / New Body (default New Body).
- Footer: (i), OK, Cancel.
**After profile+path chosen (standard):** additional value fields appear — **Distance** (0–1 fraction of path, default 1.0 = full length), **Twist Angle** (default 0.0 deg), **Taper Angle** (default 0.0 deg).
**On-canvas manipulator:** drag handle along the path controls the Distance fraction; inline value box.
**Timeline:** appends a Sweep node.

## 4. Loft — (no default shortcut)
**Path:** CREATE > Loft.
**Pre-selection / prompt:** needs **2+ Profiles** (sketch regions / planar faces / points). Order of selection = loft order.
**Dialog panel (LOFT), tabs: [Feature] [Analysis].**
- **Profiles** — a pick-cursor button + an ordered **list box**; **+** add row / **x** remove. Each added profile becomes a row; per-row a small dropdown lets you set that profile's **end condition / tangency** (Connected / Tangent / Direction / Sharp — shown when a profile row is selected).
- **Guide Type** — 2 icon toggle: **Rails** / **Centerline** (mutually exclusive guiding method).
- **Rails** — pick-cursor + list box + **+ / x** (guide curves the loft follows; when Centerline chosen this becomes a single Centerline pick).
- **Chain Selection** — checkbox, default **ON**.
- **Closed** — checkbox, default **OFF** (loops last profile back to first → closed loop solid).
- **Tangent Edges** — 2 icon toggle (how tangent/merged edges are handled).
- **Operation** — dropdown Join / Cut / Intersect / New Body (default New Body).
- Footer: (i), OK, Cancel.
**On-canvas:** no drag manipulator; shape is defined purely by the picked profiles/rails. Per-profile tangency has a small on-canvas glyph.
**Timeline:** appends a Loft node.

## 5. Rib — (no default shortcut)
**Path:** CREATE > Rib.
**Pre-selection / prompt:** needs an **open sketch profile** (one or more connected open curves) positioned so the rib can grow down into existing solid walls.
**Dialog panel (RIB):**
- **Profile** — selection "Select" (the open sketch line/curve).
- **Thickness Direction** — 2 icon toggle: **Symmetric** (both sides of the line) / **One Side**.
- **Extent Type** — dropdown: **To Next** (default, grows until it hits the solid) / **Distance**.
- **Flip Direction** — icon button (flips which way the rib extrudes down toward the body).
- (**Thickness** value box appears after a profile is selected — default e.g. `1 mm`; also a **Depth/Distance** box when Extent = Distance.)
- Footer: (i), OK, Cancel.
**On-canvas manipulator:** thickness + direction arrows on the sketch line.
**Timeline:** appends a Rib node. Operation is always Join (rib always adds material to the existing body — no operation dropdown).

## 6. Web — (no default shortcut)
**Path:** CREATE > Web.
**Pre-selection / prompt:** needs **open sketch curves** (one or more lines) to become thin structural webs between walls. Like Rib but supports a network of intersecting lines.
**Dialog panel (WEB):** identical layout to Rib plus one extra:
- **Profile** — selection "Select" (the open sketch curves).
- **Thickness Direction** — 2 icon toggle: Symmetric / One Side.
- **Extent Type** — dropdown: **To Next** (default) / **Distance**.
- **Flip Direction** — icon button.
- **Extend Curves** — checkbox, default **ON** (extends the sketch lines until they meet the bounding faces so gaps auto-close). *This is the field unique to Web vs Rib.*
- (**Thickness** value box after profile selected.)
- Footer: (i), OK, Cancel.
**Timeline:** appends a Web node (Join only, like Rib).

## 7. Hole — shortcut H
**Path:** CREATE > Hole (H).
**Pre-selection / prompt:** click a planar **Face** first (auto-fills Face = "1 selected") then a hole preview appears at the click point; canvas hint "Select linear or circular reference edges to fully define hole location". Position is constrained via up to two **Reference** edges (linear → offset distances; circular → concentric).
**Dialog panel (HOLE):**
- **Placement** — 2 icon toggle: **Single point on face + references** (default) / **From Sketch Points** (places a hole at every point in a selected sketch — array of holes).
- **Face** — selection "N selected" [x].
- **Reference** — "Select" (1st locating edge → gives an editable offset dim).
- **Reference** — "Select" (2nd locating edge → 2nd offset dim). Concentric to a circular edge needs only one.
- **Shape Settings** (expandable section):
  - **Extents** — dropdown: **Distance** (default) / **To** / **All**, plus a flip icon.
  - **Hole Type** — 3 icon toggle: **Simple** / **Counterbore** / **Countersink**.
    - Counterbore adds interactive dims: *Counterbore Diameter* (e.g. 23.10 mm) + *Counterbore Depth* (1.00 mm).
    - Countersink adds *Countersink Diameter* + *Countersink Angle*.
  - **Hole Tap type** — 4 icon toggle: **Simple** / **Clearance** / **Tapped** / **Taper Tapped**.
    - *Clearance* adds fastener-clearance fields (standard/fastener type/fit).
    - *Tapped* / *Taper Tapped* reveal the full thread spec block (below).
  - **Thread (length) toggle** — appears when Tapped: 2 icon toggle = **Full length** / **To specified depth**.
  - **Drill Point** — 2 icon toggle: **Flat** / **Angle** (Angle default; drill-point angle default **118.0 deg**).
- **Interactive dimension diagram** (below the icons): a live cross-section drawing with editable value boxes for every dimension — *Hole Diameter* (default 21.00 mm here), *Drill Point Angle* 118.0 deg, *Depth* 21.00 mm (+ counterbore/countersink dims when applicable). Editing on the diagram = editing the feature.
- **Thread spec block** (visible when Tapped): **Thread Type** = ISO Metric profile · **Size** = 20.0 mm · **Designation** = M20x2.5 · **Class** = 6H · **Direction** = Right hand / Left hand · **Modeled** checkbox (OFF = cosmetic thread, ON = real cut thread geometry). All dropdowns.
- **Objects To Cut** — collapsible section (choose which bodies the hole cuts; default all intersecting).
- Footer: (i), OK, Cancel.
**On-canvas manipulators:** the hole preview shows a draggable center point + arrows; two dimension witness lines to the reference edges are editable inline.
**Operation:** Hole is always a **Cut** (no operation dropdown). **Timeline:** appends a Hole node.

## 10a. Cylinder (primitive) — CREATE > Cylinder
**Flow:** pick a **plane/planar face** → click a **center point** → drag/type **diameter** → dialog opens.
**Dialog panel (CYLINDER):**
- **Placement** — shows the chosen **Face**/plane [x].
- **Diameter** — value box (default = whatever you dragged, e.g. 25.346 mm).
- **Height** — value box (default 1.00 mm; live drag arrow on canvas).
- **Operation** — dropdown Join / Cut / Intersect / New Body (default Join when placed on an existing body's face; no New Component).
- (**Objects To Cut** section appears for Cut/Intersect.)
- Footer OK/Cancel.
**On-canvas manipulator:** an up **arrow** at the axis top drags Height with an inline value box.
**Timeline:** appends a Cylinder node (implemented internally as sketch-circle + extrude, but shown as one primitive node).

## 8. Thread — (no default shortcut)
**Path:** CREATE > Thread.
**Pre-selection / prompt:** click a **cylindrical face** (auto-fills Faces = "1 selected"); a live thread preview wraps the cylinder. Canvas hint "Specify size, or hold Ctrl/CMD to modify selections". Multiple cylindrical faces can be threaded at once.
**Dialog panel (THREAD):**
- **Faces** — selection "N selected" [x].
- **Modeled** — checkbox, default **OFF**. OFF = cosmetic/graphic thread (no real cut geometry, lightweight). ON = fully modeled helical cut geometry.
- **Full Length** — checkbox, default **ON**. When OFF, reveals **Length** and **Offset** value boxes to thread only part of the cylinder.
- **Thread Type** — dropdown, big standards list: ISO Metric profile (default), ACME Screw Threads, AFBMA Standard Locknuts, ANSI Metric M Profile, ANSI Unified Screw Threads, BSP Pipe Threads, DIN Pipe Threads, DIN Wood Screw Thread, GB Metric Profile, GB Pipe Threads, GOST Self-tapping, ISO Metric Trapezoidal, ISO Pipe Threads, Inch Tapping Threads (+for Plastics), JIS Pipe Threads, Metric Forming Screw Threads, Metric Tapping for Plastics.
- **Size** — dropdown (nominal size, auto-derived from the cylinder radius, e.g. 26.0 mm).
- **Designation** — dropdown (e.g. M26x1.5 — the pitch options for that size).
- **Class** — dropdown (fit class, e.g. 6g external / 6H internal).
- **Direction** — dropdown: **Right hand** (default) / **Left hand**.
- **Remember Size** — checkbox, default OFF (reuse this size next time).
- Footer: (i), OK, Cancel.
**On-canvas:** thread preview only (no drag handles); a size dimension label shows on the cylinder.
**Timeline:** appends a Thread node.

## 9. Emboss — (no default shortcut)
**Path:** CREATE > Emboss.
**Pre-selection / prompt:** needs **Sketch Profiles** (text or closed sketch curves — sketched on a plane) and a target **Face** (planar or curved) to project/wrap onto.
**Dialog panel (EMBOSS):**
- **Sketch Profiles** — selection "Select" (the text/graphic sketch region).
- **Faces** — selection "Select" (destination face(s)).
- **Tangent Chain** — checkbox, default **ON** (auto-includes tangent-connected faces so text wraps around fillets/curves = the wrap-to-face behavior).
- **Effect** — 2 icon toggle: **Emboss** (raise material outward, default) / **Deboss** (recess/engrave inward).
- (**Depth** value box appears once profiles+face+effect are set; for Deboss it's the cut depth, for Emboss the raise height. Projecting onto a curved face wraps the profile along it.)
- Footer: (i), OK, Cancel.
**Timeline:** appends an Emboss node.

## 10b. Coil (primitive) — CREATE > Coil
**Flow:** pick a **plane/face** → click **center point** → drag/type **diameter** → dialog opens with a live red helix preview.
**Dialog panel (COIL):**
- **Profile** — the placement Face/plane [x].
- **Type** — dropdown: **Revolution and Height** (default) / **Revolution and Pitch** / **Height and Pitch** / **Spiral**. (Chosen pair drives which of Revolutions/Height/Pitch are inputs vs derived.)
- **Rotation** — icon toggle (clockwise / counter-clockwise handedness).
- **Diameter** — value box (e.g. 25.128 mm).
- **Revolutions** — value box (e.g. 3).
- **Height** — value box (e.g. 28.269 mm).
- **Angle** — value box (taper angle, default 0.0 deg).
- **Section** — dropdown: **Circular** (default) / **Square** / **Triangular (External)** / **Triangular (Internal)**.
- **Section Position** — dropdown: **On Center** (default) / Inside / Outside (where the section sits relative to the coil diameter).
- **Section Size** — value box (e.g. 6.282 mm — wire thickness).
- **Operation** — dropdown Join / Cut / Intersect / New Body (defaulted to Cut here because the preview intersected the box).
- **Objects To Cut** section (for Cut/Intersect).
- Footer OK/Cancel.
**On-canvas manipulator:** diameter ring drag + inline value box; height/rotation arrows.
**Timeline:** appends a Coil node.

## 10c. Pipe (primitive) — CREATE > Pipe
**Flow:** select a **Path** (edge chain or sketch curve) → dialog reveals size fields with a live preview.
**Dialog panel (PIPE):**
- **Path** — selection "N selected" [x].
- **Chain Selection** — checkbox, default ON.
- **Distance** — value box, default **1.00** (fraction 0–1 of the path length the pipe covers).
- **Section** — dropdown: **Circular** (default) / Square / Triangular.
- **Section Size** — value box (e.g. 2.00 mm — outer diameter/width).
- **Hollow** — checkbox, default OFF. When ON, adds a **Section Thickness** value box (wall thickness → tube).
- **Operation** — dropdown Join / Cut / Intersect / New Body.
- **Objects To Cut** section (for Cut/Intersect).
- Footer OK/Cancel.
**On-canvas manipulator:** inline Section Size value box on the pipe; a distance handle along the path.
**Timeline:** appends a Pipe node.

## 10d. Box / Sphere / Torus (primitives) — brief
- **Box** — CREATE > Box: pick plane → drag/click **2 base corners** (Length, Width) → drag **Height**. Dialog: Length, Width, Height value boxes + **Operation** (Join/Cut/Intersect/New Body). Length/Width also editable inline on canvas; height drag arrow.
- **Sphere** — CREATE > Sphere: pick plane → click **center** → drag **Diameter**. Dialog: **Diameter** + **Operation**. Single drag handle.
- **Torus** — CREATE > Torus: pick plane → click **center** → drag inner ring. Dialog: **Diameter** (of the ring path) + **Torus/Pipe Diameter** (tube thickness) + a section-position control + **Operation**. Two drag handles (ring size + tube size).
(All primitives share the same **Operation** dropdown Join/Cut/Intersect/New Body and place onto a picked plane/face; each is stored as one primitive node in the timeline.)

## 11. Pattern (CREATE > Pattern ▶) — Rectangular / Circular / Pattern on Path / Geometric Pattern
Submenu has four entries: **Rectangular Pattern**, **Circular Pattern**, **Pattern on Path**, **Geometric Pattern**.

### 11a. Rectangular Pattern
**Dialog (RECTANGULAR PATTERN):**
- **Type** — icon segmented control at top (mirrors the object-type: Faces / Features / Bodies).
- **Object Type** — dropdown: **Bodies** (default) / **Faces** / **Features** / **Construction Geometry**. (This is the master selector for *what kind* of thing you pattern; "Components" patterning is done via a component-level pattern.)
- **Objects** — selection "N selected" [x] (pick the bodies/faces/features to duplicate).
- **Axes / Directions** — selection "Select" — pick **Direction 1** (a linear edge/axis/sketch line); an optional **Direction 2** appears after the first. *(Note: in this survey the Axes field was hard to activate — clicks kept going to Objects; behavior is the same fragile focus quirk seen in Revolve's Axis field.)*
- After a direction is chosen, per-direction: **Distance Type** dropdown = **Extent** (total span) / **Spacing** (gap between instances); **Distance** value; **Quantity** (count); **Symmetric** checkbox.
- **Suppression** — expandable list to toggle individual instances off.
- **Compute Option** — dropdown: **Optimized** (default) / **Identical** / **Adjust** (how instances that collide with geometry are recomputed).
- Footer OK/Cancel.
**On-canvas:** grid of ghost previews + a quantity/distance handle per direction with inline value boxes.

### 11b. Circular Pattern
Same Object-Type/Objects grammar, then: **Axis** (rotation axis — edge/axis/cylinder), **Quantity** (count), **Angle** (total sweep, default 360 deg), **Distribution** dropdown = **Full** (evenly over 360) / **Angle** (spaced by the given angle), **Symmetric** checkbox, Suppression, Compute Option. **Operation** implicit (pattern copies the source feature's operation).

### 11c. Pattern on Path
Object-Type/Objects, then **Path** (a curve/edge chain), **Quantity**, **Distance/Distribution** (Spacing vs Extent along the path), **Orientation** (Path Direction / Identical), Start-point flip, Suppression, Compute Option.

### 11d. Geometric Pattern
Faster/lighter pattern for many instances (mesh-style duplicate) — same object + direction/axis inputs, optimized for large counts.

## 12. Mirror — (no default shortcut)
**Path:** CREATE > Mirror.
**Dialog panel (MIRROR):**
- **Object Type** — dropdown: **Bodies** (default) / **Faces** / **Features**.
- **Objects** — selection "Select" (what to mirror).
- **Mirror Plane** — selection "Select" (a planar face or a construction/origin plane to reflect across).
- Footer: (i), OK, Cancel.
**On-canvas:** ghost preview of the reflected copy once plane is chosen. **Timeline:** appends a Mirror node.
(Same fragile multi-field focus behavior: click the target field before picking geometry.)

## 13. Misc CREATE entry points (brief)
- **Create Sketch** — CREATE > Create Sketch: prompts "select a plane/planar face"; picking one enters the **SKETCH** contextual environment (own ribbon + Sketch Palette on the right + green **Finish Sketch**). The entry point for every profile-based feature.
- **Create Base Feature** — CREATE > Create Base Feature: switches into a dedicated **BASE FEATURE SOLID / BASE FEATURE SURFACE** history-free context (own ribbon + green **Finish Base Feature**). Everything modelled inside collapses to a single **base feature** node (imported/direct-edit geometry with no parametric history) — used for imported meshes/STEP or non-parametric edits.
- **Derive** — CREATE > Derive: pulls geometry/parameters from *another* Fusion design into this one as a linked, updatable **Derive** node (needs a second document; opens a data-panel picker).
- **New Component** — NOT on the SOLID CREATE menu in this version; it lives under the **ASSEMBLE** dropdown (ASSEMBLE > New Component). Creating a component makes a sub-container in the browser with its own origin/bodies/joints. (The CREATE menu's component-ish entries are only *Create PCB* ▶ and *Joint Origin*.)
- **Automated Modeling / Create Form / Thicken / Boundary Fill** also live in CREATE (Create Form → T-Spline sculpt env; Thicken → offset a surface into a solid; Boundary Fill → cap/split regions bounded by surfaces/planes into new bodies).

---

## Cross-cutting behaviors relevant to webcad
1. **Operation dropdown** on every material feature = **Join / Cut / Intersect / New Body** (exactly 4; *New Component* is NOT in feature Operation lists — it's a browser/assemble concept). Default = New Body for the first feature, Join when adding onto an existing body's face.
2. **Feature dialogs dock top-right** as a floating panel with an (i) info icon + OK (disabled until valid) + Cancel. OK commits and appends one node to the bottom **Timeline**; double-click a timeline node re-opens its dialog.
3. **On-canvas manipulators + inline value boxes** are the primary interaction: drag arrow/ring handles for distances/angles, and an editable numeric box floats next to the handle — typing there == editing the field. Dragging past zero flips direction (negative).
4. **Extent Type pattern** is shared: Distance / To Object(To) / All (+ To Next on models with geometry). Direction: One Side / Two Sides / Symmetric recurs across Extrude/Revolve/Rib/Web.
5. **Multi-selection-field commands** (Revolve, Sweep, Loft, Pattern, Mirror, Hole references) each have several selection slots; **you must click the target slot to make it active before picking**, and a stray click on empty space or wrong geometry clears the current slot. Selection is canvas-pick driven — clicking hidden browser items does NOT feed a selection slot (they must be made visible first). Webcad should make the active selection slot visually obvious and sticky.
6. **Profiles accept sketch regions OR planar faces**; axes/paths accept edges, sketch lines, or (visible) origin axes.
7. **Threads** are parametric to a large standards library, with a **Modeled** (real geometry) vs cosmetic toggle — mirrored in both the Hole (Tapped) dialog and the standalone Thread dialog.
8. **Primitives** (Box/Cylinder/Sphere/Torus/Coil/Pipe) are placement-plane → click/drag → dialog, and each still exposes the Join/Cut/Intersect/New Body Operation, so they double as boolean tools, not just "new body" makers.

