# Fusion 360 — INSERT + TIMELINE + Selection/Context Spec

Captured live from Autodesk Fusion (Education License), DESIGN workspace, SOLID tab, mm/g units.
Operator #2 pass. Companion to `_fusion_inspect_view_spec.md` (INSPECT + VIEW). Purpose: webcad parity reference for the under-documented INSERT menu, the bottom TIMELINE bar, and selection / right-click context menus.

Test doc: Untitled, one throwaway solid box (Body1), an Analysis node, a Center-of-Mass marker.

## TOP-12 webcad-actionable behaviors (executive summary)
1. **One image-picker for all inserts**: image/SVG/DXF/mesh all route through a single "Insert" browser = cloud-project list + **"Insert from my computer…"** → OS file-open with a per-type filter. Offline-capable, no upload.
2. **Decal vs Canvas are two different image tools**: Decal = image *skinned onto a face* (Chain-Faces across fillets, Opacity, aspect-locked W/H, X/Y pos + Z-angle, H/V flip). Canvas = flat *tracing underlay on a plane* (Opacity, Display-Through, Selectable/Renderable flags, non-uniform Scale X/Y + Scale-Plane).
3. **Canvas Calibrate** = draw a line on the image, type its real length → whole canvas rescales to true size (right-click the Canvas node). Essential for tracing.
4. **SVG/DXF import as EDITABLE SKETCH CURVES** (not images) on a chosen plane, then extrudable. DXF adds a **Units** interpretation dropdown + per-layer include checklist + Single-Sketch/One-Sketch-per-Layer mode; SVG adds Z-angle + Control-Point-Fitting.
5. **Mesh import** = declare source Units + up-axis, place via a move/rotate gizmo (+ Center / Move-to-Ground quick commands + numeric override); result is a mesh body.
6. **Local vs cloud/online inserts**: local files work offline; **Derive** (associative link to another hub design) and the **McMaster-Carr / manufacturer / TraceParts** web catalogs need account+network (were greyed/gated here).
7. **Timeline = ordered feature nodes + draggable roll-back marker + play/step controls**; rolling back SUPPRESSES later features non-destructively (verified: Step-Back un-filleted the box, Step-Forward restored). A body CAN exist with no timeline node (imported/base feature).
8. **Feature node right-click**: Edit (Feature/Sketch) / Roll-Marker-Here / Suppress / Delete / Rename / Reorder(Move) / Find-in-Browser, plus type-specific quick-action (Extrude on a sketch). Double-click a node = reopen its create dialog.
9. **Timeline settings** (gear): Change-to-Direct-Modeling (drop history), Component-Color-Swatch, Hide-inactive-features.
10. **Marking menu** (right-click 3D view): 8 customizable radial wedges (Press Pull / Hole / Move-Copy / Sketch / Delete / Undo / Redo) + top "Repeat last" + an overflow list (Pan/Zoom, Remove/Show-All/Unisolate, Workspace, Extrude/Fillet).
11. **SELECT menu**: marquee modes (Window rectangle / Freeform lasso / Paint brush) + tools (By Name/Size/Boundary, Invert, Seed-and-Boundary) + Priority (Body/Face/Edge) + a per-type Filter checklist with "Select Through" (pick occluded).
12. **Selection grammar**: click to pick (priority/filter-driven), Ctrl/Shift to accumulate, drag L→R = window(contain, blue/solid) vs R→L = crossing(touch, green/dashed).

## CAN'T-VERIFY / gated (honest list)
- **Insert Derive** — opened the cloud "Select Source" picker but did NOT complete (needs a cloud source design + establishes a link, likely needs host doc saved). Cloud-gated.
- **Insert McMaster-Carr / Insert a manufacturer part / Insert TraceParts Supplier Components** — GREYED-OUT (web-catalog + sign-in gated); could not open.
- **Insert Component / Insert Fastener / Duplicate With Joints** — greyed (need assembly/joint context).
- **Fillet (solid-feature) timeline node right-click + double-click-edit** — the timeline node hit-targets are ~10px; automation could not reliably trigger them (only the Sketch node responded). Feature-menu grammar captured from the Sketch node + standard behavior; exact "Edit Feature"/"Move"/"Explode" wording not seen live.
- **Origin-plane browser context menu** — automation returned only a generic 6-item fallback (Physical Material/Appearance/Texture Map/Remove/Show All/Unisolate); the true per-type menu wasn't confirmed live.
- **Box-select window-vs-crossing color cue** — documented from standard Fusion behavior; the exact drag wasn't re-exercised in this pass.

All 14 mission items were attempted. Fusion left CLEAN (box + Analysis + COM only), dialog-free, in DESIGN/SOLID, unsaved, not closed.

---
# PART 1 — INSERT

## INSERT toolbar button + full dropdown
The SOLID > INSERT group has 3 quick-access icons (Insert Derive-ish / Canvas-image / Insert-Into-Current-Design box) above an **INSERT ▾** label. Clicking the big INSERT button (or the icons) launches commands directly; clicking the **INSERT ▾** text opens the full menu.

**Insert Into Current Design** (the big toolbar button / the box-with-arrow icon): opens a modal "Insert" **data browser** — left column = cloud PROJECT list (Admin Project, BoPeep, B Wand, Cat, ... — the user's Fusion Team hub projects), right pane = folders/files in the selected project (NAME + LAST UPDATED columns), plus an **"Insert from my computer…"** button (bottom-left) and Cancel / Insert. This pulls an existing Fusion design/component in as a referenced/linked component. Cloud-project driven (needs the Fusion Team data panel; local file supported via the button).

**Full INSERT ▾ dropdown (top→bottom, enabled state noted):**
1. **Decal** — ENABLED
2. **Canvas** — ENABLED
3. **Insert SVG** — ENABLED
4. **Insert DXF** — ENABLED
5. **Insert Mesh** — ENABLED
--- divider ---
6. **Insert Component** — greyed (disabled in this context)
7. **Insert Fastener** — greyed
8. **Duplicate With Joints** — greyed
--- divider ---
9. **Insert Derive** — ENABLED
--- divider ---
10. **Insert McMaster-Carr Component** — greyed (web/library-gated)
11. **Insert a manufacturer part** — greyed (web/library-gated)
12. **Insert TraceParts Supplier Components** — greyed (web/library-gated)

Note: the 3 online-catalog items (McMaster-Carr / manufacturer part / TraceParts) are disabled here = they open a web catalog panel and require sign-in/online; documented as web-gated (see below). Insert Component / Insert Fastener / Duplicate With Joints greyed likely because context (no suitable selection / no joints) — Insert-Into-Current-Design covers the component-insert path from the toolbar button.

## 3. Decal  (INSERT > Decal)  — VERIFIED (loaded a local PNG, no cloud/save prompt)
Workflow: invoke Decal → image picker opens (the same "Insert" data browser + **"Insert from my computer…"** → native Windows Open dialog, filter "Image Files (*.png;*.jpg;*.jpeg)"). Local image loaded WITHOUT any save/upload/cloud prompt. Then prompt "Select a face to place the image on" → pick a face → decal projects onto it with an on-canvas move+rotate manipulator, and the panel expands.

DECAL panel fields (top→bottom):
- **Image** — file chip (decal_test.png) + `×` to clear/replace the source image.
- **Face** — Select (the target face; the decal is UV-projected onto it).
- **Chain Faces** — checkbox (default ON): wrap/continue the decal across tangent-adjacent faces instead of clipping at the face edge.
- **Opacity** — 100, with a 0–100 slider (decal transparency).
- **Keep Aspect Ratio** — checkbox (default ON): lock Width:Height so scaling one drives the other.
- **Width** — 25.495 mm (decal size on the face).
- **Height** — 25.495 mm.
- **X Distance** — 0.00 mm (in-plane position offset, U).
- **Y Distance** — 0.00 mm (in-plane position offset, V).
- **Z Angle** — 0.0 deg (rotation of the decal about the face normal).
- **Horizontal Flip** — icon toggle (mirror left↔right).
- **Vertical Flip** — icon toggle (mirror top↔bottom).
- OK / Cancel.

Mapping: image is planar-projected onto the picked face; position = X/Y distance, orientation = Z angle, size = Width/Height (aspect-locked by default), plus H/V mirror. Chain Faces makes it flow across a fillet/adjacent face. Result persists as a **Decal** node under the body (visual only, no geometry change). Cancelled in this pass (not persisted).

## 4. Canvas  (INSERT > Canvas)  — VERIFIED (loaded local PNG, no cloud/save prompt)
Same image-picker entry as Decal (Insert data-browser + "Insert from my computer" → native Open dialog). Then prompt "select a face or plane" → pick a face/construction plane → image is attached as a flat reference underlay (light-blue tint) with a move+rotate manipulator. Used for TRACING (sketch over a reference photo/drawing).

CANVAS panel fields (top→bottom):
- **Image** — file chip + `×`.
- **Face** — "1 selected" + `×` (target plane or planar face).
- **Canvas opacity** — 50 (default), 0–100 slider (see-through the reference image).
- **Display Through** — checkbox (default ON): keep the canvas visible even when it's behind solid geometry (so it doesn't get occluded while you trace).
- **Selectable** — checkbox (default OFF): whether the canvas can be picked by the cursor (off = you can sketch over it without accidentally grabbing it).
- **Renderable** — checkbox (default OFF): whether the canvas shows up in renders.
- **X Distance** — 0.00 mm (in-plane position).
- **Y Distance** — 0.00 mm (in-plane position).
- **Z Angle** — 0.0 deg (rotation about the plane normal).
- **Scale X** — 1.00.
- **Scale Y** — 1.00.
- **Scale Plane** (uniform) — 1.00.
- **Horizontal Flip** / **Vertical Flip** — icon toggles.
- OK / Cancel.

Result persists as a node under a **Canvases** browser folder (and adds a node to the TIMELINE). Contrast with Decal: Canvas has separate Scale X/Y (non-uniform) + a uniform Scale Plane and NO aspect-lock; Decal uses Width/Height with Keep-Aspect. Canvas = a flat tracing underlay on a plane; Decal = an image skinned onto a face (chain-able across faces, opacity for surface graphics).

### Calibrate (right-click the Canvas browser node > Calibrate)  — VERIFIED
Canvas node context menu (right-click): **Create Selection Set / Edit Canvas / Calibrate / Replace Canvas Image File / Delete (Del) / Rename / Show-Hide (V) / Selectable-Unselectable / Find in Window / Find in Timeline**.
**Calibrate** = the scale-to-real workflow for tracing: the view reorients flat to the canvas, prompt "select first point" then a second point → you draw a reference line across a known feature in the image → a value field appears ("Input a new value to calibrate", pre-filled with the line's current measured length, e.g. 21.028246 mm) → type the real-world length and the whole canvas rescales so that line matches. This makes traced sketches come out at true scale. It is a POST-creation command, not a create-dialog field.

webcad takeaways: two distinct image-underlay tools. Canvas (tracing): plane/face + opacity + display-through + selectable/renderable flags + non-uniform scale + a Calibrate "draw-a-line, type-its-real-length" rescale. Decal (surface graphic): face + chain-faces + opacity + aspect-locked width/height + position(X/Y)+Z-angle + H/V flip. Both accept a local image via a standard file-open (no cloud upload required).

## 5a. Insert SVG  (INSERT > Insert SVG)  — VERIFIED (loaded local test.svg)
File picker: same "Insert" data-browser → "Insert from my computer" → native Open dialog filtered **"SVG Files (*.svg)"**. On file+plane pick, Fusion ENTERS THE SKETCH ENVIRONMENT and imports the SVG paths as **editable sketch curves** on the chosen plane (a new sketch appears under a **Sketches** browser folder; ribbon switches to SKETCH with the Sketch Palette).

INSERT SVG dialog fields:
- **Select SVG File** — file chip + `×`.
- **Sketch plane** — "1 selected" (any plane or planar face; view auto-orients flat to it).
- **X Distance** — 0.00 mm (in-plane position).
- **Y Distance** — 0.00 mm.
- **Z Angle** — 0.0 deg (rotation).
- **Scale Plane XY** — 1.00 (uniform scale factor; there is NO separate units dropdown — the SVG comes in at its own unit interpretation and you scale with this factor).
- **Horizontal Flip** / **Vertical Flip** — icon toggles.
- **Control Point Fitting** — checkbox (fit the imported curves through control points / spline-fit the paths vs preserve segments).
- OK / Cancel.
Result on OK = sketch geometry you can extrude/revolve. Cancel backs out the import but LEAVES you inside the (now empty) sketch — must Finish Sketch to exit.

## 5b. Insert DXF  (INSERT > Insert DXF)  — VERIFIED (loaded local test2.dxf)
Insert DXF opens its OWN dialog directly (not the sketch env up-front). Fields collapse until a valid DXF loads; a malformed DXF is silently rejected (my first minimal DXF w/o EOF marker didn't load; OK stayed greyed). With a valid DXF the full panel is:
- **Plane/Sketch** — Select (a plane, planar face, or an existing sketch to import into).
- **Select DXF...** — file browse (its own "Select DXF file" data-browser + "Select from my computer" → native Open, filter "DXF Files (*.dxf)").
- **Units** — dropdown: `Centimeter / Millimeter / Meter / Inch / Foot / Yard / Micron / Hectometer / Mile / Mil` — how to interpret the DXF's numeric coordinates (DXF is unit-less; this scales it). (SVG has NO units dropdown — this is DXF-specific.)
- **Insert Mode** — dropdown: `Single Sketch` (all layers → one sketch) / `One Sketch per Layer` (each DXF layer → its own sketch).
- **X Distance** / **Y Distance** — 0.00 mm in-plane position offset. (No Z-Angle for DXF, unlike SVG.)
- **DXF Layers** — expandable checklist of the file's layers (each layer = a checkbox; e.g. layer "0") to include/exclude specific layers on import.
- **Control Polyline** — checkbox (import polylines as control-point/fit curves).
- OK / Cancel.
Result = sketch geometry (curves) on the chosen plane, importable as one sketch or per-layer.

webcad takeaways for SVG/DXF: both import vector art as EDITABLE SKETCH CURVES on a chosen plane (not as image underlays). Shared grammar: plane + file + position + scale + flip. Differences to mirror: DXF adds a Units interpretation dropdown + per-layer include list + Single-vs-per-Layer mode; SVG adds a Z-Angle rotation + Control-Point-Fitting and comes in at its own units scaled by a single Scale factor. Local file import via a standard OS file-open (no cloud).

## 5c. Insert Mesh  (INSERT > Insert Mesh)  — VERIFIED (loaded local test.stl)
File picker = same "Insert" data-browser + "Select from my computer" → native Open, filter **"Mesh Files (*.3mf *.obj *.stl)"**. On load, the mesh drops in as a **mesh body** (new node under Bodies, flagged with a ⚠ if it needs repair) at the origin, with an on-canvas 3-axis MOVE + ROTATE manipulator (translate arrows + rotate rings).

INSERT MESH dialog fields:
- **Unit Type** — dropdown: `Centimeter / Millimeter / Meter / Inch / Foot` ("one unit from the original file equals one <unit>"; STL/OBJ are unit-less so you declare the scale).
- **Flip Up Direction** — icon toggle (swap the file's up axis Y↔Z; STL/OBJ export conventions differ).
- **Position** (expandable, open by default):
  - **Center** — icon command: snap the mesh centered on the origin.
  - **Move To Ground** — icon command: drop the mesh so it sits on the ground plane.
- **Numerical Inputs** (expandable) — X/Y/Z translation + rotation numeric fields (standard; could not force-expand via automation but this is where you type exact placement).
- **Reset** — icon: revert placement to as-loaded.
- OK / Cancel.
On OK the mesh becomes a MESH body (edited in the MESH workspace / convertible to BRep). Unlike SVG/DXF (sketch curves) or Canvas/Decal (image), Insert Mesh brings in actual 3D geometry.

webcad takeaway: mesh import = declare source units + up-axis, place with a full move/rotate gizmo (+Center / Drop-to-ground quick commands + numeric override), result is a mesh body. Accepts STL/OBJ/3MF from local disk.

## 1. Insert Derive  (INSERT > Insert Derive)  — VERIFIED (opened source picker; did not complete)
Opens a **"Select Source"** data-browser: cloud PROJECT list on the left, and on the right the Fusion DESIGN files in that project (folders + designs, e.g. "arm", "buckle", "Bambu Labs A1 MINI", "Centerlock"...). Crucially there is **NO "Insert from my computer"** here — Derive links to ANOTHER cloud Fusion document only. After picking a source you get a Derive dialog to choose which bodies / sketches / components / construction geom / parameters to pull in as a **linked (associative) derived reference** that updates when the source changes. Completing a derive establishes a cross-document link (and generally needs the host document saved). NOT completed in this pass (cloud-source + link/save gated) — Select-Source grammar captured.

## 2. Online-catalog inserts — Insert McMaster-Carr / Insert a manufacturer part / Insert TraceParts Supplier Components
All three were **GREYED-OUT / disabled** in the INSERT menu in this context (unsaved single-part doc). These open embedded web-catalog panels (McMaster-Carr, manufacturer libraries, TraceParts) that require online sign-in and download a supplier CAD model into the design. Documented as **web/library-gated** — could not exercise (disabled). Insert Component / Insert Fastener / Duplicate With Joints were likewise greyed (need an assembly/joint context). CAN'T-VERIFY items.

webcad takeaway: distinguish local-file inserts (image/SVG/DXF/mesh — work offline via OS file-open) from cloud/online inserts (Derive from another hub doc; McMaster/manufacturer/TraceParts web catalogs) that need account + network. Derived references are associative links, not copies.

---
# PART 2 — TIMELINE (bottom bar)

The timeline is the horizontal strip at the very bottom of the canvas (left of TEXT COMMANDS). Left→right: **playback controls**, then the **feature nodes** (one icon per operation, in creation order), then the **roll-back marker** (a vertical line with a T-handle) that sits after the last active feature, and a **settings gear** at the far right.
NOTE: the base solid box (Body1) has NO timeline node here — it was brought in as a base/history-less body, confirming a body can exist without a timeline entry. Only history operations (Canvas, Sketch, Fillet, ...) create nodes.

## 7. Feature-node right-click context menu  — SKETCH node VERIFIED; solid-feature node inferred
Right-clicking a **Sketch** timeline node gave (VERIFIED, top→bottom):
- Create Selection Set
- **Extrude** (E) — quick-action to consume the sketch (feature-type-specific shortcut)
- **Edit Sketch** — reopen the sketch for editing (enters SKETCH env)
- **Redefine Sketch Plane** — move the sketch to a different plane/face
- **Select Sketch Plane**
- Configure — add to a configuration table
- --- Delete (Del) / Rename ---
- **Roll Timeline Marker Here** — move the history marker to just after this node (= "Roll History Here")
- **Convert to DM Feature** — bake into a direct-modeling (history-free) feature
- **Suppress Features** — temporarily disable this feature (non-destructive)
- --- Find in Browser / Find in Window ---
For a SOLID feature node (e.g. Fillet) the menu is the same shape but the top action reads **Edit Feature** (double-click equivalent) instead of Edit Sketch, and there is a **Move** (reorder) entry; compound/pattern features add **Explode**. (Could not trigger the Fillet node's right-click via automation — the timeline node hit-targets are ~10px and only one specific node responded; grammar captured from the Sketch node + standard Fusion behavior. CAN'T-VERIFY the exact Fillet-node wording live.)

## 8. Roll-back marker + playback controls  — playback VERIFIED
Playback controls at the far left of the timeline (L→R): **Jump to Beginning**, **Step Back** (previous feature), **Play** (animate history build forward), **Step Forward** (next feature), **Jump to End**.
- VERIFIED: clicking **Step Back** moved the roll marker left one node and the box's Fillet vanished (edge went sharp) — the feature is SUPPRESSED, not deleted; **Step Forward / Jump to End** restored it. This is Fusion's non-destructive "roll history" — you can insert/edit at any marker position and everything after re-solves.
- The **roll-back marker** (T-handle after the last node) can be dragged left/right to scrub through history to the same effect (drag grabs the top T-handle; the click-drag at the node row did not grab it in automation, but Step-Back demonstrated the identical result).
- Rolled-back (greyed) nodes show dimmed; "Hide all inactive features" (settings gear) can hide them.

## 9. Double-click a feature node = re-open its create dialog
Standard Fusion behavior: double-clicking a solid-feature node reopens that feature's original create dialog (e.g. double-click Fillet → the Fillet dialog with the same radius/edges); double-clicking a Sketch node = Edit Sketch (enters the sketch). (Could not fire double-click reliably on the small timeline nodes via automation — documented from known behavior; the single-click Edit path is confirmed by the context-menu "Edit Sketch"/"Edit Feature" entry.)

## 10. Timeline settings (gear at far right of timeline)  — VERIFIED
Clicking the gear opens a small menu:
- **Change to Direct Modeling** — convert the whole design from parametric (timeline) to direct/history-free modeling (removes the timeline).
- **Component Color Swatch** — checkbox (off): tint each timeline node by its owning component's color (assembly readability).
- **Hide all inactive features** — checkbox (on): hide suppressed/rolled-back nodes from the strip.
Right-clicking the EMPTY timeline area produced no menu (unlike some builds that offer horizontal/vertical docking there) — in this version timeline options live on the gear. The timeline is horizontal/docked at the bottom here.

webcad takeaways: a parametric timeline = ordered feature nodes + a draggable roll-back marker (scrub history, non-destructive suppress) + play/step controls. Each node's right-click = Edit (Feature/Sketch) / Roll-Marker-Here / Suppress / Delete / Rename / Reorder(Move) / Find-in-Browser, with type-specific quick-actions (Extrude on a sketch). Double-click = edit. Provide a "convert to direct/history-free" escape hatch and a per-component color-coding toggle. A body can exist without a history node (imported/base feature).

---
# PART 3 — SELECTION & CONTEXT MENUS

## 12. Canvas MARKING MENU (right-click in the 3D view)  — VERIFIED
Right-clicking geometry (a face/body) pops a two-part **marking menu** centered on the cursor:
**Radial wedges** (8-way ring of pill buttons = the quick-access modeling commands; the top wedge is always "Repeat <last command>"):
- Top: **Repeat <last command>** (here "Repeat Roll Timeline Marker Here")
- **Delete** (upper-left) | **Press Pull** (upper-right)
- **Undo** (left) | **Redo** (right, greyed when nothing to redo)
- **Move/Copy** (lower-left) | **Hole** (lower-right)
- **Sketch ▾** (bottom, a dropdown wedge → sketch-create submenu)
**Overflow list** (vertical menu hanging below the ring, the "everything else"):
- **OK** (Return) / **Cancel** (Esc)
- **Pan** / **Zoom** (view nudges without leaving the menu)
- **Remove** / **Show All** / **Unisolate** (visibility)
- **Workspace ▶** (submenu — switch DESIGN/RENDER/MANUFACTURE/etc.)
- **Extrude** (E) / **Fillet** (F)
- **Insert Component** (greyed here)
The wedge set is context/selection-sensitive (face vs edge vs body vs empty change the offered commands) and is user-customizable. The ring gives muscle-memory gesture access (flick toward a wedge); the list is the fallback for the rest.

webcad takeaway: a radial marking menu (8 customizable wedges + "repeat last" at top + an overflow list) over the 3D view is the core right-click pattern — gesture-select common ops (Press Pull, Hole, Move/Copy, Sketch, Delete, Undo/Redo) with everything else in the drop list (view nudges, visibility, workspace switch, more feature commands).

## 14. SELECT dropdown (top-right of ribbon)  — VERIFIED
Top-level items:
- **Select** — the default arrow (single-click pick).
- **Window Selection** (`1`) — drag a rectangle to select.
- **Freeform Selection** (`2`) — drag a freehand lasso to select.
- **Paint Selection** (`3`) — drag a brush over faces to add them.
- **Selection Tools ▶**: `Select By Name` / `Select By Boundary` / `Select By Size` / `Invert Selection` / `Seed And Boundary` (grow a selection from a seed out to a bounding loop).
- **Selection Priority ▶**: `Select Body Priority` / `Select Face Priority` / `Select Edge Priority` — bias what the cursor grabs first when several entity types overlap.
- **Selection Filters ▶** — a big object-type checklist (all ON by default), plus two switches at top:
  - **Select Through** (ON) — allow Window/Freeform selection to also catch hidden/occluded objects behind visible ones.
  - **Select All** — master toggle to check/uncheck every type.
  - Types: Bodies, Body Edges, Body Faces, Body Vertices, Canvas, Components, Construction Geometry, Coordinate Systems, Custom Graphics, Decal, Dimension, Features, Joint Origins, Joints, Mesh Bodies, Mesh Face Groups, Mesh Faces, PMI, Sketch Curves, Sketch Geometry Constraint, Sketch Points, Sketch Profiles, Sketch Surface, T-Spline Body, Text Selection.
  (Uncheck a type to make it un-pickable — e.g. turn off everything but Body Edges to only grab edges.)

webcad takeaways: a Select menu should offer (a) marquee modes — rectangle window, freeform lasso, paint-brush; (b) programmatic tools — by name / by size / by boundary / invert / seed-and-boundary grow; (c) a priority bias (body vs face vs edge); (d) a per-type filter checklist with "Select Through" (pick occluded) and a Select-All master.

## 11. Selection mechanics (model mode)  — partially verified
- **Single left-click** = pick one entity; the cursor pre-highlights on hover, click commits. Type is governed by Selection Priority + Filters (above). Clicking again elsewhere replaces the selection.
- **Ctrl/Shift+click** = add/remove entities from the current selection set (multi-select).
- **Box / marquee** (default Select tool, drag in empty space): drag **Left→Right = WINDOW select** (only entities FULLY inside the box; drawn as a solid/blue rectangle) vs drag **Right→Left = CROSSING select** (any entity the box TOUCHES; drawn as a dashed/green rectangle). Same L-R/R-L window-vs-crossing convention as AutoCAD. (Documented from Fusion's standard behavior + the drag-rectangle Window/Freeform modes in the SELECT menu; the colored-rectangle distinction is the standard cue — this exact drag wasn't re-exercised in this automation pass.)
- The bottom-right status line echoes the current selection ("1 Face | Area : 2400.00 mm^2", "1 Edge", etc.) — verified repeatedly during this pass.

webcad takeaway: click to pick (priority/filter-driven), Ctrl/Shift to accumulate, and a marquee whose direction sets window(contain) vs crossing(touch) with a blue-vs-green/solid-vs-dashed visual cue.

## 13. BROWSER-tree right-click context menus  — Sketch VERIFIED; body per op#1; origin noted
Right-clicking a browser node gives a node-type-specific menu (distinct from the same feature's TIMELINE menu).

**Sketch node** (right-click Sketch2 in browser) — VERIFIED, full list:
- Move to Group
- --- Create Selection Set / **Extrude** (E) / **Offset Plane** ---
- **Edit Sketch** / **Redefine Sketch Plane** / **Select Sketch Plane** / **Slice Sketch** / Configure
- --- **Export DXF** / Delete (Del) / Rename ---
- **Look At** / **Hide Profile** / **Show Dimension** / **Hide Projected Geometries** / **Hide Construction Geometries** / **Show/Hide** (V)
- --- **Find in Window** / **Find in Timeline** ---
(Richer than the timeline sketch menu: adds Export DXF, Look At, Slice Sketch, Offset Plane, and per-content visibility sub-toggles.)

**Body node** (right-click Body1): documented in `_fusion_inspect_view_spec.md` — Move/Copy(M), Move to Group, Create Selection Set, Configure, Physical Material, Appearance(A), Texture Map Controls, Properties, Save As Mesh, Copy/Cut/Delete/Remove/Rename, Display Detail Control, Show/Hide(V), Selectable/Unselectable, Opacity Control, Isolate, Find in Window. (Body = the place to open the mass Properties table + assign Physical Material / Appearance.)

**Origin plane node** (right-click XY): in this session it returned only a minimal/generic menu — Physical Material / Appearance(A) / Texture Map Controls / Remove / Show All / Unisolate. This appearance-oriented set is not semantically meaningful for a datum plane, and the identical menu appeared spuriously on a first mis-registered click elsewhere, so I treat it as a FALLBACK/truncated render rather than the true origin-plane menu. CAN'T-VERIFY the real origin-plane menu; the meaningful, reliable origin-plane interactions are its **eye (Show/Hide)** toggle and being pickable as a sketch/section plane. (Flag: automation produced a generic 6-item menu for several browser nodes on first click — a real user gets the full per-type menu.)

webcad takeaway: browser nodes carry per-type context menus that overlap but differ from the timeline menus — a sketch node adds Export-DXF / Look-At / Slice / Offset-Plane / granular visibility; a body node is the entry to Properties + Physical Material + Appearance + Isolate. Datum/origin nodes need only Show/Hide + be selectable as references.
