# Fusion 360 — SOLID tab ASSEMBLE (装配/joints) grammar (live capture)

Captured live from Autodesk Fusion (Education License), DESIGN workspace, SOLID tab, mm units, English UI.
Purpose: reference for webcad assembly/joint parity. Companion to `_fusion_solid_spec.md` (CREATE) + `_fusion_construct_spec.md` (datums) + `_fusion_modify_spec.md` (MODIFY).
Scratch geometry on canvas during capture: one **box body** (Body1) + one **cylinder body** (Body2, sits on box top) + one **construction axis** (vertical) + a sketch. Left by operators #1/#2/#3.

Inherited quirks (confirmed by prior operators): (a) **multi-selection-slot focus** — click the target selection slot to activate it before picking geometry; stray empty-canvas clicks PAN or clear the slot. (b) **IME focus-drop** — Escape is often dead; exit a tool via right-click marking-menu → OK/Cancel. (c) thin silhouette **edges are pixel-fragile**; faces/vertices snap reliably. (d) **joints need COMPONENTS, not bodies** — must create components first.

---

## ★★ CRITICAL ARCHITECTURE FINDING — assembly authoring is GATED in this build/state

Unlike CREATE/MODIFY/CONSTRUCT (which are rich dropdowns), the **ASSEMBLE ribbon panel in this Fusion build exposes exactly ONE command: "Add To Assembly"** (icon = two boxes with an arrow; the panel's ▾ dropdown lists only that one item — verified by zoom, nothing greyed below it). Clicking it raises a modal **"Save design required — This design needs to be saved first to add it to an assembly. Save and Insert this design into an assembly?"** with **[Save and Insert] [Cancel]**. Per HARD SAFETY I clicked Cancel — never saved.

The classic assembly-authoring commands (**New Component, Joint, As-Built Joint, Rigid Group, Enable/New Contact Set, Motion Link, Motion Study, Drive Joints**) are **NOT reachable** in the current state:
- **Ribbon:** ASSEMBLE panel has only "Add To Assembly". None of the joint commands are on it.
- **Body/root context menus:** right-clicking a Body (or the root component node) gives NO "Create Components from Bodies" and NO "New Component". The body menu = Move/Copy, Move to Group, Create Selection Set, Physical Material, Appearance, Texture Map Controls, Properties, Copy, Cut, Delete, Remove, Show/Hide, Selectable/Unselectable, Isolate. The root-node menu = Physical Material, Appearance, Texture Map Controls, Remove, Show All, Unisolate.
- **Keyboard shortcut J** → does nothing (no Joint dialog).
- **Command search palette (`S` → "Design Shortcuts" search box):** searches the full command DB. Query **"Joint"** returns ONLY **"Joint Origin"** (Joint / As-Built Joint absent). Query **"Component"** / **"New Component"** returns ONLY **"Display Component Colors"** (New Component / Create Components from Bodies absent).

**Interpretation:** This design is a single root "part" (Body1/Body2 sit directly under root; the browser Document Settings even shows a **"Part Design"** node). In this build/license/state, joints & multi-component authoring require the design to first be **saved and turned into an assembly** (the only path offered = "Add To Assembly" → save). Because the mission forbids saving, the Joint / As-Built / Rigid Group / Contact / Motion / Motion-Study / Drive-Joints dialogs **could NOT be driven live this session.** Only **Joint Origin** (a datum-like feature that works inside a single part — also listed in CREATE per operator #1's item 26) is available and IS driven live below.

**Discrepancy vs operator #1's note:** operator #1's solid spec claimed "New Component … lives under the ASSEMBLE dropdown (ASSEMBLE > New Component)." That was an *assumption* (standard Fusion) — in THIS build the ASSEMBLE dropdown does NOT contain New Component. Trust this live check.

**webcad takeaway:** Do NOT gate assembly authoring behind a cloud save. webcad should let users create components/joints in an unsaved local design freely. Sections 1/2/3/5/6/7/8/9/10 below are therefore documented from Fusion product grammar (clearly flagged **[NOT LIVE — gated this build]**) so webcad still has the target spec; only §4 Joint Origin is **[VERIFIED LIVE]**.

---

## 4. Joint Origin  [★ VERIFIED LIVE — driven & committed, then undone]

**Path:** available as **CREATE > Joint Origin** (operator #1's item 26) AND via command-search "Joint Origin". (It is a datum-like feature that works inside a single part — which is why it's the ONE assembly-family command available without components/save.)
**Purpose:** creates a reusable, named joint-origin frame that a later Joint can snap to (a placed coordinate frame with position + orientation).
**Pre-selection / prompt:** launches with the **Snap** field active; canvas hint **"Select a Snap point to place the Joint Origin"**. Hovering geometry reveals a snap glyph (snaps to vertices, edge midpoints, face centers, arc centers — vertices snap reliably). Picked a box corner.
**Dialog panel (JOINT ORIGIN), docked top-right — before a snap it's minimal (Origin Mode + Snap); after a snap it expands:**
- **Origin Mode** — a **3-icon segmented toggle** (verified). The three modes = **Simple** (default, single snap point — the selected icon), **Between Two Faces** (origin placed midway between two faces), **Two Edge Intersection** (origin at where two edges intersect). Matches the mission's expected Simple / Between Two Faces / Two Edge Intersection.
- **Snap** — selection field, "Select" → **"1 selected"** [x] once a point is picked.
- **▼ Position** (section, auto-expands after snap):
  - **Angle** — value box, default `0.0 deg` (rotates the origin frame about its normal).
  - **X Offset** — value box, default `0.00 mm`.
  - **Y Offset** — value box, default `0.00 mm`.
  - **Z Offset** — value box, default `0.00 mm`.
- **Flip** — an icon button (flips the origin's axis direction).
- **▶ Axis Alignment** — a collapsible subsection (did not expand on click in this pass; in standard Fusion it holds **X Axis** + **Z Axis** selection pickers to re-orient the origin's frame by picking an edge/face). Grammar noted; expansion not captured.
- Footer: **(i)** · **OK** (greyed until a snap point is picked) · **Cancel**.
**On-canvas manipulator (verified):** placing the origin drops a **triad manipulator** at the snap point — **translate arrows** (an up-arrow for Z + diagonal in-plane arrows) + a **blue rotation arc** with a floating inline **"0.0 deg"** value box. Tooltip: "Adjust the Joint Origin position or orientation". Dragging the handles updates the Angle/Offset fields (two-way bind, same idiom as feature dialogs).
**★ RESULT / storage (verified live):** OK committed and:
  - **Browser** auto-created a new dedicated **"Joint Origins"** folder (positioned between **Origin** and **Bodies**); the joint origin nests there. (Separate from the Construction folder used for datum planes/axes/points.)
  - **Timeline** appended a **Joint Origin** node (circle-with-crosshair icon) after the existing nodes. Double-click to re-edit.
  - Undone cleanly with Ctrl+Z (folder + node removed) to restore the original scratch state.
**webcad takeaway:** model Joint Origin as a lightweight datum-frame feature (Snap point + Mode{Simple/Between-2-Faces/2-Edge-Intersection} + Angle + X/Y/Z Offset + Flip + optional X/Z axis alignment), stored in its own "Joint Origins" browser folder + a timeline node. It's the reusable anchor a Joint later references — worth building even before full joints.

---

# SECTIONS BELOW: [NOT LIVE — gated in this build (require a saved multi-component assembly, forbidden by HARD SAFETY)]
Documented from Fusion product grammar so webcad has the target spec. Field lists are Fusion-accurate but were NOT driven on this machine this session — treat as design reference, not eyewitness capture. See "HONEST CAN'T-VERIFY" at the bottom.

## 1. New Component  [NOT LIVE — command absent from this build's UI/search]
**Path (standard Fusion):** ASSEMBLE > New Component (also right-click a Body → "Create Components from Bodies"). BOTH absent here.
**Dialog (NEW COMPONENT) — standard fields:**
- **Type** — icon toggle: **Standard** (default) / **Sheet Metal** (+ sometimes Electrical/Harness). Sets the component's modelling rules.
- **From Bodies** — optional selection: pick existing bodies to wrap into the new component (this is what "Create Components from Bodies" does — bodies move into the new component). If empty, an **Empty** component is created.
- **Internal / External** — toggle: **Internal** (default — component data lives inside THIS design) vs **External** (creates a separate linked design file = a distributed design; requires choosing a save location in the data panel → cloud save). External is the save-gated path.
- **Name** — text field (default "Component1", "Component2"…).
- **Parent** — selection (which component the new one nests under; default = the active component / root).
- **Activate** — checkbox (make the new component the active edit target immediately after creation).
- Footer: (i) · OK · Cancel.
**Browser result:** a **Component node** with a distinct component icon (differs from the body icon) + a small **activation radio-dot** on the right showing which component is currently active (only one active at a time; its name is bold). Each component carries its OWN sub-folders: Origin, Bodies, Sketches, Construction, Joints, Joint Origins. Timeline appends a "New Component" node.
**webcad takeaway:** a component = a sub-container with its own origin + occurrence transform + activation state. The Internal/External split (embedded vs linked-external file) and the single-active-component model are the load-bearing concepts.

## 2. Joint (J) — THE BIG ONE  [NOT LIVE — gated]
**Path:** ASSEMBLE > Joint, shortcut **J**. (J produced nothing here — no components.)
**Pre-selection / prompt:** "Select the first component's joint origin/snap point" then the second. The joint-origin **snaps** to face centers, edge midpoints, vertices, arc/circle centers (hover previews the snap). **Component 2 moves to align onto Component 1** (Component 1 is treated as the ground reference for the mate).
**Dialog (JOINT) — three tabs across the top: [Position] · [Motion] · [Limits].**
- **Position tab:**
  - **Mode** — same 3-icon toggle as Joint Origin (Simple / Between Two Faces / Two Edge Intersection) governing how each joint origin is placed.
  - **Snap** — the two component picks (Component1 origin, Component2 origin).
  - **Offset** — **X / Y / Z** distance value boxes + **Angle** + a **Flip** button (reposition/re-orient the mate).
- **Motion tab:**
  - **★ Type dropdown (7 joint types — the core of the whole command):** **Rigid** / **Revolute** / **Slider** / **Cylindrical** / **Pin-Slot** / **Planar** / **Ball**.
    - **Rigid** — 0 DOF (fully fixed); no motion axis fields.
    - **Revolute** — 1 rotational DOF; field **Rotate** = axis dropdown (Z Axis default / X / Y / Custom pick).
    - **Slider** — 1 translational DOF; field **Slide** = axis dropdown.
    - **Cylindrical** — rotate + slide about the SAME axis; one axis dropdown drives both.
    - **Pin-Slot** — 1 rotate axis + 1 (different) slide axis; two dropdowns (**Rotate** + **Slide**).
    - **Planar** — slide in a plane (2 DOF) + rotate about the plane normal; **Plane** + **Rotate** fields.
    - **Ball** — 3 rotational DOF; **Pitch / Yaw / Roll** axis fields.
- **Limits tab (per active DOF — a Rotation block and/or a Slide block):**
  - **Rest** — checkbox + value (the neutral/rest position the joint returns to).
  - **Minimum** — checkbox + value (lower travel bound).
  - **Maximum** — checkbox + value (upper travel bound).
  - **Animate** — button that sweeps the joint through its range as a preview.
  - (Optionally Motion "maximum force"/damping in some builds — not core.)
**On-canvas manipulator:** joint-origin snap glyphs on both components; for the chosen Type, a motion handle — a **rotation arc** (Revolute/Cylindrical/Pin-Slot rotate), a **slide arrow** (Slider/Cylindrical/Pin-Slot slide), or ball rings (Ball) — draggable with inline value box.
**Result:** browser gains a **Joints** folder; a **Joint node** appears there and in the Timeline (double-click to re-edit). The joint enforces the DOF — dragging the moved component in the canvas now respects the joint (e.g. only rotates about the revolute axis).
**webcad takeaway:** ONE Joint command; a two-origin snap-and-mate on Position, a 7-way motion **Type** enum on Motion, and per-DOF Rest/Min/Max/Animate on Limits. The 7 types map to standard mechanical joints — implement as {DOF axes} presets over a generic 6-DOF frame-to-frame constraint.

## 3. As-Built Joint (Shift+J)  [NOT LIVE — gated]
**Path:** ASSEMBLE > As-Built Joint, shortcut **Shift+J**.
**Difference from Joint:** components are **NOT moved** — the joint is created wherever the parts already sit (you assemble by position first, then declare the joint in place). So there is **no Offset section**.
**Dialog (AS-BUILT JOINT):**
- **Component 1** / **Component 2** — two component selection fields.
- **Type** — the SAME 7-type dropdown (Rigid / Revolute / Slider / Cylindrical / Pin-Slot / Planar / Ball).
- **Location** — a snap-point pick that defines the joint's axis/center (for Revolute/Cylindrical/etc.); for Rigid, no location needed.
- **Angle/Flip** as applicable to the motion type; **Limits** available after creation (same Rest/Min/Max).
- Footer: (i) · OK · Cancel.
**webcad takeaway:** As-Built = Joint minus the reposition step. Same type enum; picks a location for the motion axis rather than mating two origins.

## 5. Rigid Group  [NOT LIVE — gated]
**Path:** ASSEMBLE > Rigid Group.
**Dialog (RIGID GROUP):**
- **Components** — a multi-selection field: pick **2+ components** to lock together so they move as one rigid unit (a temporary weld that can be suppressed/deleted, unlike a Rigid joint between just two).
- **Include Contact** / **Include Child Components** — a checkbox (per mission's "Include Contact?" — in current Fusion the option is typically **"Include Contacts"**/child-inclusion, controlling whether contained sub-components/contacts are swept into the group). *(Exact checkbox label not verifiable this build.)*
- Footer: (i) · OK · Cancel.
**Result:** a **Rigid Group** node in the browser/timeline. Selecting & dragging any member moves the whole group.
**webcad takeaway:** Rigid Group = an N-component weld (vs Joint's 2-component Rigid), suppressible as a feature.

## 6. Enable Contact Sets / New Contact Set  [NOT LIVE — gated]
**Contact model (two global modes):**
- **Enable All Contact** — every body collides/contacts every other body (heavy; good for quick checks).
- **Enable Contact Sets** — only explicitly-defined **Contact Sets** participate in contact (scoped, performant).
**New Contact Set dialog (NEW CONTACT SET):**
- **Contact Set** — one or two selection fields: pick the bodies that should register contact with each other (e.g. gear teeth ↔ gear teeth).
- Footer OK/Cancel → creates a **Contact Set** node (browser has a "Contacts" group). Contact only affects motion when joints drive parts into each other.
- **Enable All Contact / Disable All Contact** are toggles (mission §10) that flip the global model on/off.
**webcad takeaway:** contact is a motion-time collision model, scoped either globally (All Bodies) or by named Contact Sets; it's what makes gears/cams actually push each other during Drive Joints / Motion Study.

## 7. Motion Link  [NOT LIVE — gated]
**Path:** ASSEMBLE > Motion Link.
**Dialog (MOTION LINK):**
- **Joints** — select **2 existing joints** to couple.
- **Motion ratio** — per-joint value pair (e.g. Joint 1 = 360 deg ↔ Joint 2 = 10 mm), expressing a gear/rack ratio; or a single **Ratio** number.
- **Reverse** — checkbox (invert the coupling direction).
- Footer OK/Cancel → a **Motion Link** node. Driving one linked joint now drives the other by the ratio (gear train, rack-and-pinion).
**webcad takeaway:** Motion Link = a proportional constraint between two joints' DOFs (ratio + reverse).

## 8. Motion Study  [NOT LIVE — gated] (brief — panel structure)
**Path:** ASSEMBLE > Motion Study. Opens a dedicated **Motion Study panel** at the bottom (replaces the timeline area):
- A **frame timeline** (horizontal, with a scrubber + Play/Stop controls) spanning e.g. 0–100 steps.
- **Rows** — one row per joint you add (a "+"/joint picker adds a joint's DOF as an animatable row).
- Each row has **keyframe cells**: set the joint's value at various frames; Fusion interpolates between them.
- **Play** animates all joints together; can export video.
**webcad takeaway:** a keyframe table (joint rows × frames) driving joint values over time, with playback — separate from the parametric timeline.

## 9. Drive Joints  [NOT LIVE — gated]
**Path:** right-click a **Joint** in the browser/canvas → **Drive Joints** (also ASSEMBLE menu).
**Dialog (DRIVE JOINTS):**
- **Value slider + value box** — for the joint's DOF (angle for revolute, distance for slider). Drag to move the mechanism live; respects Limits if set.
- **Steps** / start & end values + an **Animate/Play** control to sweep the DOF and preview motion (and optionally record).
- Footer OK/Cancel.
**webcad takeaway:** Drive Joints = an interactive single-joint jog (slider + animate), the quickest way to exercise a mechanism without a full Motion Study.

## 10. Context-menu assembly ops  [NOT LIVE — gated] (brief)
- **Enable All Contact / Disable All Contact** — global contact toggles (see §6).
- **Copy / Paste component** — right-click a component → Copy, then Paste creates another **occurrence** (an instance; "Paste New" makes an independent copy). Occurrences share the component definition — edit one, all update.
- **Ground / Unground** — right-click a component → **Ground** pins it fixed in space (a small pin icon appears on the browser node); **Unground** releases it. The grounded component is the assembly's fixed reference (like Component 1 in a Joint). *(In this build the body context menu had no Ground — it's a component-only op, and there are no components.)*
- **Rigid Group / Break Rigid Group**, **Enable/Disable Contact Sets** also live in the component context menu.
**webcad takeaway:** components are occurrences of a shared definition; exactly one is typically **Grounded** (fixed); joints/rigid-groups constrain the rest relative to it.

---

## ★ TOP 12 WEBCAD-ACTIONABLE ASSEMBLY BEHAVIORS

1. **Do NOT save-gate assembly authoring.** THE headline finding: this Fusion build hides ALL of New Component / Joint / As-Built / Rigid Group / Contact / Motion / Drive Joints until the design is saved into an assembly (only "Add To Assembly" → cloud-save is offered). This is a UX trap — webcad must let users make components & joints in an unsaved local design immediately.

2. **Component = sub-container + occurrence + activation.** A component owns its own Origin/Bodies/Sketches/Construction/Joints/JointOrigins sub-folders, has an **activation radio-dot** (exactly one active edit target), and is placed via an **occurrence transform**. "Create Components from Bodies" just wraps existing bodies into components. Bodies ≠ components; **joints require components**.

3. **Joint Origin is the reusable anchor and IS a single-part feature.** Verified live: Snap-point + Mode{Simple / Between Two Faces / Two Edge Intersection} + Position{Angle, X/Y/Z Offset} + Flip + Axis Alignment. Stored in a dedicated **"Joint Origins" browser folder** + a timeline node. Build this first — it's independent of the (heavier) component/joint machinery.

4. **Snapping is the joint-placement grammar.** Joint origins snap to **face centers, edge midpoints, vertices, arc/circle centers** with a hover preview glyph. webcad's assembly picker should surface those canonical snap points, and vertices/centers should snap far more reliably than thin edges (inherited pixel-fragility quirk).

5. **One Joint command, 3 tabs: Position / Motion / Limits.** Position = two-origin snap-and-mate with Offset(X/Y/Z + Angle + Flip); Motion = the **7-type enum**; Limits = per-DOF Rest/Min/Max/Animate. Mirror this tabbed structure.

6. **The 7 joint types are the core enum:** **Rigid / Revolute / Slider / Cylindrical / Pin-Slot / Planar / Ball**. Implement each as a preset of enabled DOF axes over a generic frame-to-frame constraint (Rigid=0 DOF … Ball=3 rot DOF). Same enum is reused by As-Built Joint.

7. **Joint vs As-Built Joint = "move to mate" vs "declare in place".** Joint repositions Component 2 onto Component 1 (has Offset); As-Built keeps parts where they are (no Offset, just a Location pick for the axis). Offer both.

8. **Limits (Rest/Minimum/Maximum) + Animate** turn a DOF into a bounded, previewable range. Rest = neutral return position; Animate sweeps the range. Cheap, high-value for mechanism feel.

9. **Rigid Group = N-component weld** (vs Joint's 2-component Rigid), suppressible as a feature. Good for locking a cluster that shouldn't articulate.

10. **Contact model is global-or-scoped:** All-Bodies vs named Contact Sets, with Enable/Disable-All toggles. Contact only matters during motion (Drive Joints / Motion Study) — it's what makes gears/cams push each other. Keep it opt-in/scoped for performance.

11. **Motion Link = proportional coupling of two joints** (ratio + reverse) → gear trains / rack-and-pinion. **Drive Joints = single-joint jog slider + Animate.** **Motion Study = keyframe table (joint rows × frames) + playback.** Three escalating levels of "make it move".

12. **Ground exactly one component as the fixed reference** (pin icon on the browser node); everything else is constrained relative to it. Copy/Paste creates additional **occurrences** of a shared definition (edit-one-update-all) vs Paste-New for an independent copy.

## HONEST CAN'T-VERIFY / PARTIAL LIST
- **§1 New Component, §2 Joint, §3 As-Built Joint, §5 Rigid Group, §6 Contact Sets, §7 Motion Link, §8 Motion Study, §9 Drive Joints, §10 context ops** — **NOT driven live.** These commands are absent from this build's ASSEMBLE ribbon (only "Add To Assembly"), from Body/root context menus (no "Create Components from Bodies"/"New Component"), from the **`J` shortcut** (dead), and from the **`S` command-search DB** ("Joint"→only Joint Origin; "Component"/"New Component"→only Display Component Colors). The only offered path to any of them is "Add To Assembly" → **Save design required** modal, which HARD SAFETY forbids. Their dialog field-lists above are Fusion-accurate product grammar, NOT eyewitness capture on this machine — verify against a live saved assembly before treating as ground truth.
- **§4 Joint Origin — VERIFIED LIVE** end-to-end (dialog, 3-mode toggle, Position fields, on-canvas manipulator, commit → "Joint Origins" folder + timeline node, undo). BUT: the **Axis Alignment** subsection would not expand on click this pass (its X/Z-axis pickers are described from product knowledge, not seen); the exact tooltip labels of the 3 Origin-Mode icons were inferred from their icons (not hovered to a tooltip). Numeric values shown (0.0 deg / 0.00 mm) are the neutral defaults on this scratch geometry.
- Whether the gated commands would fully appear AFTER a save (vs being genuinely removed from this build) was not tested — saving is forbidden. Strong inference (the save-required modal literally says the design must be saved "to add it to an assembly") is that a save unlocks them, but this is unconfirmed.
- **Add To Assembly** dialog beyond the "Save design required" modal was not explored (would require saving).

## SECTIONS ATTEMPTED (all mission items)
All 10 mission items attempted. **§4 Joint Origin fully VERIFIED LIVE.** §1/2/3/5/6/7/8/9/10 attempted via ribbon + both context menus + `J` shortcut + three `S`-search queries and found **gated behind a save** in this build; documented from Fusion product grammar and flagged NOT LIVE. Multi-pronged unlock attempts (ribbon dropdown, body context menu, root-node context menu, keyboard shortcut, command search) all exhausted without triggering a save.

## FUSION LEFT: CLEAN + DIALOG-FREE
Joint Origin committed for capture then **Ctrl+Z undone** — browser back to Origin / Bodies(Body1,Body2) / Sketches / Construction; no "Joint Origins" folder; no open dialog; still in DESIGN/SOLID. Never saved, never closed.

