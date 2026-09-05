# Fusion 360 — INSPECT + VIEW/Display/Navigation/Settings Spec

Captured live from Autodesk Fusion (Education License), DESIGN workspace, SOLID tab, mm/g units.
Purpose: webcad parity reference for the daily-UX surface (Inspect panel + View/Navigation/Display/Settings).

Test body used: a solid box 40 (length, X) x 60 (width, Y) x 30 (height, Z) mm, default Steel material implied (no material assigned).

## INSPECT panel — full menu (SOLID > INSPECT dropdown)
Items, in order, with keyboard shortcuts:
1. **Measure** — shortcut `I`
2. **Interference**
3. **Curvature Comb Analysis**
4. **Zebra Analysis**
5. **Draft Analysis**
6. **Curvature Map Analysis**
7. **Isocurve Analysis**
8. **Accessibility Analysis**
9. **Minimum Radius Analysis**
10. **Section Analysis**
11. **Center of Mass**
--- divider ---
12. **Display Component Colors** — `Shift+N` (toggle)
13. **Display Mesh Face Groups** — `Shift+F` (toggle)

Note: this is a richer set than the brief listed. Draft/Isocurve/Accessibility/Minimum-Radius are additional surface/manufacturing analyses. "Physical/Mass Properties" is NOT a separate menu item here — mass properties live in **Center of Mass** dialog + right-click body > Properties (verified below).

## 1. Measure  (INSPECT > Measure, shortcut `I`)
Palette (top-right, non-modal) fields:
- **Selection Filter** — 3 toggle icons: Select Faces / Select Bodies / Select Sketches (priority filter for what the cursor picks; all on by default so you can pick vertices/edges/faces freely).
- **Precision** — dropdown, decimal places 0..8: `0, 0.1, 0.12, 0.123 (default), 0.1234, 0.12345, 0.123456, 0.1234567, 0.12345678`.
- **Secondary Units** — dropdown, default `None` (lets you show a second unit system alongside, e.g. inch).
- **Clear Selection** — reset icon (empties the current selections).
- **Show Snap Points** — checkbox (adds midpoint/quadrant snap markers to pick from).
- **Close** button.

Behavior is selection-driven — the readout adapts to WHAT you pick. Prompt: "Select objects to measure." Status bar (bottom-right) echoes a one-line summary.

Readouts observed (test box 40x60x30):
- **1 face selected** → `Area` (2400.00 mm^2) + `Loop Length` (perimeter, 200.00 mm). Status: "1 Face | Area : 2400.00 mm^2".
- **2 faces** → **Results: Angle** (90.00 deg) between them; plus per-selection panels "Selection 1 / Selection 2" each showing that face's Area + Loop Length. Status: "2 Faces | Angle : 90.0 deg".
- **2 edges** → **Results: Distance** (min distance, 50.00 mm) + **Angle** (0.00 deg for parallel); per-selection `Length` for each edge (60.00 mm). An on-canvas dimension line + value is drawn between them. Status: "2 Edges | Min Distance : 50.00 mm".
- Points/vertices add **Delta X / Delta Y / Delta Z** components and center-to-center distance (documented Fusion behavior; vertex picking is finicky via automation).

webcad takeaways: one non-modal Measure tool whose result block is CONTEXTUAL to the selection (1 vs 2 entities, and entity type). Each picked entity also gets its own intrinsic readout (edge=Length, face=Area+perimeter). Global Precision + optional Secondary-Units on the palette, not per-measurement.

## 2. Interference  (INSPECT > Interference)
Modal dialog fields:
- **Select** — pick bodies or components (prompt "Select bodies or components"). Needs >= 2 overlapping bodies to be meaningful.
- **Include Coincident Faces** — checkbox (default OFF). When ON, touching/flush faces count as interference; when OFF only true volume overlaps count.
- **Compute** — button (icon) that runs the overlap calc.
- OK / Cancel.
On Compute it builds a results list of interfering PAIRS with each overlap's volume, highlights the overlap regions, and offers to create bodies from the interference volumes on OK. (Only one body in the test doc, so Compute not exercised; dialog grammar captured.)

webcad takeaway: two-stage tool — pick set, then explicit Compute (not live), then a results table of pairs+volumes with an option to materialize overlap bodies.

## 3. Section Analysis  (INSPECT > Section Analysis)
Step 1: prompt "Select a planar object to define the cut plane" — pick a planar face or a datum/origin plane.
Step 2: once a plane is picked the model is **live-clipped** (cutaway) and these controls appear:
- **Cut Plane** — "1 selected".
- **Distance** — offset of the section plane along its normal (mm). On-canvas drag manipulator (arrow) + numeric field; live cut updates as it changes.
- **Angle 1** — tilt the plane about one in-plane axis (deg).
- **Angle 2** — tilt about the other in-plane axis (deg).
- **Flip** — icon: flips which side is kept/removed.
- **Section Color** — dropdown, default `From Component` (color the cut face by the component's color, or a custom color).
- **Show Hatch** — checkbox (default ON): draws hatch pattern on the cut faces.
- OK / Cancel.
Prompt while adjusting: "Adjust distance and angles to position the cut plane". On OK the section is saved as a persistent **Analysis** node in the browser tree (an "Analysis" folder appears) — it is a toggleable, non-destructive live cutaway, NOT a real cut of the body. Multiple can be stored; each can be shown/hidden via its eye icon.

webcad takeaways: section clip = plane pick + (offset distance + 2 tilt angles + flip), rendered as a live cutaway with hatched section faces, persisted as a hideable analysis entity separate from geometry.

## 5. Center of Mass + Physical/Mass Properties
Two distinct things:

**INSPECT > Center of Mass** — modal: "Select bodies and/or components" > OK. Just PLACES a persistent COM marker (small crosshair glyph) at the computed center of mass in the viewport. No numeric readout. Useful as a visible reference point (can be selected/measured to). It does NOT open a numbers table.

**Mass properties table = right-click a Body (or component) in the browser > Properties.** (Not on the INSPECT menu, and NOT on the Bodies *folder* — the folder menu only has New Group / Create Selection Set / Show-Hide / Show All / Selectable.) The body context menu also has: Move/Copy(M), Move to Group, Create Selection Set, Configure, **Physical Material**, **Appearance(A)**, Texture Map Controls, **Properties**, Save As Mesh, Copy/Cut/Delete/Remove/Rename, Display Detail Control, Show/Hide(V), Selectable/Unselectable, Opacity Control, Isolate, Find in Window.

PROPERTIES dialog (test box 40x60x30, material Steel) shows:
- **Area** (total surface area): 10800.00 mm^2
- **Density**: 0.008 g/mm^3
- **Mass**: 565.20 g
- **Volume**: 72000.00 mm^3
- **Physical Material**: Steel
- **Appearance**: Steel - Satin
- **Bounding Box** (expandable) — axis-aligned X/Y/Z extents.
- **Center of Mass**: (-17.053 mm, 15.00 mm, 15.00 mm) i.e. X,Y,Z coords.
- **Moment of Inertia at Center of Mass** (g mm^2, expandable — Ixx/Iyy/Izz/Ixy/…).
- **Moment of Inertia at Origin** (g mm^2, expandable).
- **Copy To Clipboard** button (dumps the whole table as text).
- OK / Cancel.

Material dependence confirmed: Mass/Density/Center-of-Mass all derive from the assigned **Physical Material** (default Steel here). Change material via right-click > Physical Material — Volume/Area stay the same, Mass/Density/inertia update. Appearance is purely visual and independent of Physical Material.

webcad takeaways: mass props = a per-body computed table (area/density/mass/volume/bbox/COM/inertia @COM/@origin) gated by an assigned material; plus a lightweight "drop a COM marker" command. Provide a Copy-to-clipboard text dump. Keep Appearance (visual) separate from Physical Material (mass).

## 4. Surface analyses — Zebra / Curvature Map / Curvature Comb / Draft / Isocurve / Min-Radius (brief)
All share a common shape: pick body(ies)/faces -> a live GPU color/line OVERLAY appears -> a few display params -> OK persists it as an entry under the browser **Analysis** folder (toggle with the eye icon). They are visual continuity/manufacturability aids, non-destructive.

**Zebra Analysis** (checks reflection/continuity G0/G1/G2 via stripe alignment across edges):
- Bodies (selected set), **Direction** (2 icons: horizontal vs vertical stripes), **Repeats** (stripe count, default 20, slider), **Opacity** (default 100, slider), **Lock Stripes** (checkbox — freeze stripes to screen vs surface), **High Quality** (checkbox). OK/Cancel.

**Curvature Map Analysis** (colors surface by curvature magnitude):
- Bodies, **Type** (3 icons: Gaussian / Mean / Max-abs curvature), **Display** (3 icons: color-ramp style), **Scale** (default 1.000, slider — sensitivity), **Opacity** (default 100, slider), **High Quality** (checkbox). OK/Cancel.

**Curvature Comb Analysis** — pick edges/sketch curves; draws porcupine "comb" quills whose length = curvature; params: comb density/samples + scale. For evaluating curve fairness.

**Draft Analysis** — pick body + a pull direction; colors faces green/red by draft angle relative to that direction against a min-draft threshold (moldability check). Has a pull-direction picker + angle slider + gradient legend.

**Isocurve Analysis** — overlays the surface's U/V isoparametric curves.

**Minimum Radius Analysis** — highlights regions whose radius is below a set threshold (tooling/mill-bit check); has a radius input.

**Accessibility Analysis** — colors faces reachable vs not from a given direction (machining access).

webcad takeaway: these are all "select set + display overlay + persist as a hideable Analysis node" — a single generic surface-analysis framework with a per-type param panel would cover the family.

## 6 & 7. Display toggles (bottom of INSPECT menu)
- **Display Component Colors** (`Shift+N`) — instant view toggle: overrides each component's Appearance with a distinct solid/flat color so separate components are visually distinguishable (and by extension it cycles/assigns per-component colors). No dialog; toggles on/off. Great for reading assembly structure at a glance.
- **Display Mesh Face Groups** (`Shift+F`) — instant toggle for mesh bodies: colors each detected mesh face-group (planar cluster / feature region) a different color. No dialog. Only meaningful on MESH bodies.
These are stateless view overrides (not persisted analysis nodes). The brief's "Display Section Analyses / Interference" is not a menu item — section analyses and interference results are instead shown/hidden individually via their eye icons under the Analysis folder.

---
# PART 2 — VIEW / DISPLAY / NAVIGATION / SETTINGS

## 8. Bottom-center NAVIGATION BAR (left to right)
A compact floating toolbar centered at the bottom of the canvas. Icons, in order:
1. **Orbit** (dropdown): `Free Orbit` (rotate freely, roll allowed) / `Constrained Orbit` (keeps world up-vector, no roll).
2. **Look At** — reorients camera to look straight-on at a selected face/edge/plane/sketch (normal-to view).
3. **Pan** — hand; slide the view.
4. **Zoom** — drag to dolly zoom.
5. **Fit / Zoom Window** (dropdown) — Fit (frame everything) + Zoom Window (drag a box to zoom to it).
6. **Display Settings** (monitor icon) — see below.
7. **Grid & Snaps** (dropdown) — see below.
8. **Viewports** (dropdown) — 1/2/3/4 view layouts, see below.

## 9. DISPLAY SETTINGS menu (monitor icon on nav bar) — full tree
- **Visual Style** > `Shaded` (Ctrl+4) / `Shaded with Hidden Edges` (Ctrl+5, default) / `Shaded with Visible Edges Only` (Ctrl+6) / `Wireframe` (Ctrl+7) / `Wireframe with Hidden Edges` (Ctrl+8) / `Wireframe with Visible Edges Only` (Ctrl+9).
- **Environment** (HDRI lighting scene) > `Dark Sky` / `Grey Room` / `Photo Booth` / `Tranquility Blue` / `Infinity Pool` / `River Rubicon` / `Theme (default)` [current].
- **Graphics Preset** > `Performance` / `Quality` / `Custom` [current — auto-selected when you hand-toggle effects].
- **Effects** (checkboxes): `Environment Dome` (off) / `Ground Plane` (ON) / `Ground Shadow` (ON) / `Ground Reflection` (off) / `Object Shadow` (off) / `Ambient Occlusion` (ON) / `Anti-Aliasing` (ON). (Header line "Graphics Preset: Custom" reflects current preset.)
- **Object Visibility** (global show/hide of reference geometry, all checkboxes): `All Work Features` / `Origin Planes` / `Origin Axes` / `Origin Points` / `User Work Planes` / `User Work Axes` / `User Work Points` / `Sketches` / `User Coordinate Systems` / `Joint Origins` / `Joint Origin Axes` / `Joints`.
- **Camera** > `Orthographic` [current] / `Perspective` / `Perspective with Ortho Faces` (perspective while orbiting, snaps to true ortho on standard views).
- **Ground Plane Offset** — command to set where the ground/shadow plane sits.
- **Enter Full Screen** (`Ctrl+Shift+F`).

webcad takeaways: the daily view controls split into (a) visual style = shaded/wireframe x with/without edges (6 combos, Ctrl+4..9), (b) camera projection tri-state (ortho / persp / persp-with-ortho-faces), (c) an Effects checklist (ground plane, ground+object shadow, ground reflection, AO, AA, env dome) rolled up into Performance/Quality/Custom presets, (d) global reference-geometry visibility master toggles, (e) selectable HDRI environments.

### Grid & Snaps dropdown (nav bar, grid icon)
- **Layout Grid** (checkbox, ON) — show/hide the ground grid.
- **Layout Grid Lock** (checkbox, ON) — lock the grid to the ground plane.
- **Snap to Grid** (checkbox, OFF) — snap cursor/geometry to grid intersections.
- **Grid Settings** (dialog): radio `Adaptive` (grid spacing auto-scales with zoom) [default] vs `Fixed` (reveals **Major Grid Spacing** = 250.00 mm + **Minor Subdivisions** = 5) + **Reference Numbers** checkbox (ON — draws numeric labels along grid axes).
- **Incremental Move** (checkbox, ON) — arrow keys / move gizmo jump by a fixed step.
- **Set Increments** (dialog) — define that step distance/angle.

### Viewports dropdown (nav bar, rightmost icon)
- Single-view state: **Multiple Views** (`Shift+1`) — switches to a 2x2 quad layout: Top (TL), Front (BL), Home/Isometric (TR, large), Right (BR). Each pane gets its own mini nav bar.
- Multi-view state dropdown: **Synchronize Views** (checkbox — orbit/zoom all panes together), **Single View** (`Shift+1`, back to one pane), **Reset Views** (restore the standard 4 orientations).

webcad takeaways: grid = adaptive-or-fixed(spacing+subdivisions) + reference numbers + optional snap-to-grid; a quad-viewport mode (top/front/right/iso) with optional camera sync is a standard CAD expectation.

## 10. ViewCube (top-right corner)
Left-click interactions (animated camera moves):
- Click a **face** -> snaps to that orthographic standard view (Front/Back/Top/Bottom/Left/Right).
- Click an **edge** -> tilts to the 45deg view spanning the two adjacent faces.
- Click a **corner** -> isometric view looking at that corner.
- **Drag the cube** -> free-orbit the model.
- Hover shows a small **Home** (house) icon -> click = go to Home view; and rotation arrows / roll arrows appear around the cube for 90deg turns and roll.
Right-click menu:
- **Go Home**
- **Orthographic** [current] / **Perspective** / **Perspective with Ortho Faces** (same tri-state as Display Settings > Camera).
- **Set current view as Home** (submenu: Fixed distance / Fit to view).
- **Reset Home**
- **Set current view as** (submenu: reassign Front/Top/etc. to the current orientation).
- **Reset Front**

## 11. Mouse / keyboard navigation grammar (verified where noted)
- **Zoom**: scroll wheel. VERIFIED in this install: wheel **UP = zoom OUT**, wheel **DOWN = zoom IN** (Fusion's default; it is the inverse of most apps and is flippable in Preferences > "Zoom direction"). Zoom centers on the cursor position.
- **Pan**: hold **Middle Mouse Button (wheel) + drag**. (Fusion default; middle-drag not automatable here, but this is the standard binding.)
- **Orbit**: hold **Shift + Middle Mouse Button + drag** (free/constrained per the Orbit setting). Also draggable via the ViewCube.
- **Fit**: no default single key; use the nav-bar Fit, or double-click the Middle Mouse Button to fit all. (There is no default keyboard shortcut assigned to Fit.)
- **Standard views** (Front/Top/Right): reached via the ViewCube faces (no default number-key shortcuts in Fusion; those keys map to Visual Style instead, Ctrl+4..9).
- Preselect **highlight** on hover; single left-click selects; the marking menu (right-click) gives context actions + repeat-last.

webcad takeaways: adopt orbit=Shift+MMB, pan=MMB, zoom=wheel(cursor-centered), and expose a zoom-direction preference; provide a ViewCube-style widget where face/edge/corner clicks jump to ortho/45/iso views and dragging orbits; give Fit an accessible control. Match Ctrl+4..9 for visual styles if aiming for muscle-memory parity.

## 12. Document Settings > Units (browser tree)
Path: BROWSER > **Document Settings** node (expanded shows "Units: mm, g" + "Part Design" material sub-node). To change: right-click (or hover) the **Units** row -> a small pencil/edit icon appears -> click it -> **CHANGE ACTIVE UNITS** dialog:
- **Unit System** dropdown: `millimeter (mm), gram (g)` [current] / `centimeter (cm), gram (g)` / `meter (m), kilogram (kg)` / `inch (in), ouncemass` / `foot (ft), lbmass` / `Custom`.
- **Length** + **Mass** fields: grayed/locked when a named preset is chosen; **Custom** unlocks them to pick length & mass units independently.
- **Set as default** checkbox (persist this unit system for new docs).
- OK / Cancel.
This is a PER-DOCUMENT unit setting (distinct from the app-wide default units in Preferences). Units are display-only; internal model is unit-agnostic, so switching just re-labels/reformats values.

webcad takeaway: units belong to the document (with a global default in prefs); offer paired presets (mm/g, cm/g, m/kg, in/oz, ft/lb) plus a Custom length+mass override.

## 13. Preferences  (top-right account avatar > Preferences)
Modal dialog. Left tab tree (top-level): **General** (expandable) / **Tokens** / **Material** / **Graphics** / **Network** / **Data Collection and Use** / **Unit and Value Display** / **Default Units** (expandable) / **Preview Features** / **Compatibility & Troubleshooting**. Footer: **Restore Defaults**, Apply, OK, Cancel.
- **General** (expands to sub-tabs: API / Design / Manufacture / Electronics / Render / Drawing / Simulation and Generative Design).
- **Default Units** (expands to per-workspace sub-tabs: Manufacture / Design / Simulation and Generative Design).

Key panels captured:

**General** (root) — "Preferences controlling general UI behavior":
- User language, **Theme** (Match Device Theme / light / dark), **Graphics driver** (Auto-select), Start-up experience, Offline cache time period (days) = 15, Customize My Fusion page, Default design type (Part Design), New-document-creates-default-design (off), Create new shortcuts when updating (off), Automatic version on close (off), **Automatic recovery backup interval (min)** = 5, **Default modeling orientation** (`Z up` / Y up), **Show tooltips** (on), **Show command prompt** (on).

**General > Design** — "Preferences controlling general Design behavior":
- **Default Modeling Mode**: Parametric Modeling (vs Direct), **Auto project edges on reference** (off), **Auto look at sketch**: `Always Orthographic` (auto-rotate to face the sketch on edit), **Edit dimension when created** (on), **Show ghosted result body** (on), **Auto project geometry on active sketch plane** (on), **Auto hide sketch on feature creation** (on), **Scale entire sketch at first dimension** (off), **Enable Arrange and Simplify tools** (on), Triangulate mesh polygons (off), **Default Shading**: Smooth shaded (Organic/smooth; increased performance).

**Graphics** — "Preferences used to control the graphics display":
- **Graphics Preset**: Custom (choosing Quality/Performance preset overrides Custom), **Dynamic** (on), **Minimum framerate during navigation (FPS)** = 35, **Selection display style**: Normal, **Degraded selection display style**: Simple display (without glow or halo), **Transparency Effect**: Better Performance, Wood Bump (on), **Animate view transitions** (on), **Enable Surface Normal Display** (on), **Hidden Edge Dimming (%)** = 50, **High-resolution canvas graphics** (on).

**Default Units > Design** — "Preferences that sets default units used in new documents":
- **Default units for new design**: mm (dropdown; same preset list as Change Active Units) + Length + Mass (grayed unless Custom). This is the APP-WIDE default; the per-document value is set via Document Settings (section 12).

**Unit and Value Display** — controls number formatting (decimal places, fractional vs decimal, foot-inch display, etc.) for how measurements render.

webcad takeaways: split settings into app-wide Preferences vs per-document settings. The high-value view/UX prefs to mirror: theme, default modeling orientation (Z-up), auto-look-at-sketch, selection display style, min-navigation-FPS/graphics preset, animate-view-transitions, edit-dimension-on-create, and default units for new documents. Provide a "Restore Defaults".


