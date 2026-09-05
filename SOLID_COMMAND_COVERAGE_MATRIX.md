# SOLID command coverage matrix

Last verified: 2026-07-20.  The executable source-of-truth is
`tests/solid-command-coverage-matrix.test.mjs`; it derives the commands from
`WORKSPACES.SOLID`, so a newly visible ribbon command cannot silently escape
this audit.

| Scope | Visible leaf commands | Dispatcher | modal/pick gate | keyboard cancel / Undo | real isolated browser path |
|---|---:|---:|---:|---:|---:|
| CREATE | 29 | all 29 | all route through `runCommand` | direct-edit dialogs covered | box numeric create, cancel, undo/redo |
| MODIFY | 32 | all 32 | all route through `runCommand` | direct-edit dialogs covered | production workflows verify Scale plus canvas picks for Hole, Edit Face, Press Pull, Fillet, Chamfer and Draft |
| ASSEMBLE | 10 | all 10 | all route through `runCommand` | Assembly pick Escape covered | pending per-command geometry pick |
| CONSTRUCT | 20 methods + unified Construct Geometry entry | all 20 | explicit typed/pick route; point-driven numeric axis | production canvas picks verify Vertex Point, Axis Through Edge, Tangent Plane on a cylindrical face, Two Planes Axis on non-parallel box faces, Two Edges Plane, and Three Points Plane through UI-created canvas-selected datum points | all high-risk multi-pick canvas combinations verified on production |

## What is proven now

- Production WebGL soak on 2026-07-19: Chrome, Edge, and Firefox each
  completed 10 modelling cycles plus 60 seconds of continuous execution in
  the isolated `?ui-test=1` workspace. All exercised the six B-rep display
  styles and recorded zero console/page errors and zero ribbon-control
  overlaps at 1366px wide. Chrome and Edge heap usage returned to about
  25–26 MB after garbage collection; Firefox does not expose heap telemetry.
- The isolated SOLID browser workflow now proves the constructive datum path:
  numeric Box → Undo/Redo → Origin XZ selection → 35 mm Offset Plane entered
  with Enter → timeline datum feature. This keeps cylindrical/conical models
  usable without falsely requiring a planar side face.
- The same real-canvas workflow enters Sketch through the ribbon and selects a
  plane on the canvas, then verifies the fresh state is `Select` + `Orbit`
  with zero created geometry before returning through Finish Sketch.
- It then explicitly selects Rectangle with `R`, draws a two-point profile on
  the live canvas, and consumes it through an 18 mm Enter-committed Extrude.
  This proves the sketch-to-solid handoff rather than only its command routes.
- The production Move/Copy workflow (`tests/e2e/move-copy-workflow.playwright.mjs`)
  creates a box through the compact CREATE flyout, then opens Move/Copy from
  MODIFY, confirms its neutral zero state, commits a `25, -10, 5` mm numeric
  translation with Enter, and proves its Transform timeline entry survives
  Undo/Redo.
- The production Edit Face workflow (`tests/e2e/move-face-workflow.playwright.mjs`)
  creates a box, opens the Fusion-style **Edit Face** command from MODIFY,
  ray-picks a face interior on the real WebGL canvas, applies a 6 mm offset,
  and verifies the resulting `moveface` timeline feature retains its finite
  three-coordinate picked-face reference.
- The production Press Pull workflow (`tests/e2e/press-pull-workflow.playwright.mjs`)
  follows the same real canvas ray-pick path, inputs a 5 mm face offset, uses
  Enter to commit, and verifies the independent `pushpull` timeline feature
  retains the picked-face reference.
- The production edge-round workflow (`tests/e2e/modify-edge-round-canvas.playwright.mjs`)
  creates a numeric box, opens both **MODIFY → Fillet** and **MODIFY →
  Chamfer**, ray-picks an actual visible B-rep edge on the WebGL canvas,
  enters respectively R3 and 2 mm, and proves the committed `fillet` /
  `chamfer` timeline features retain the requested dimensions.
- The production Draft workflow (`tests/e2e/draft-canvas-pick.playwright.mjs`)
  selects a neutral face and a distinct side face from the live WebGL canvas,
  enters 5°, and proves the committed `draft` timeline feature preserves the
  finite neutral-plane and side-face references.
- The production Scale workflow (`tests/e2e/scale-workflow.playwright.mjs`)
  confirms **MODIFY → Scale** defaults its anchor to the active body's centre,
  accepts a 1.5 numeric factor, and persists an anchored `scale` history node.
- The production Hole workflow (`tests/e2e/hole-canvas-workflow.playwright.mjs`)
  creates a box, places a simple Ø8 through-hole by clicking a live B-rep
  face, and verifies the persisted hole centre, top-plane height and extent.
- The production Assembly Joint picker (`tests/e2e/assembly-joint-pick.playwright.mjs`)
  imports two real STL components, enters **ASSEMBLE → Joint**, ray-picks a
  face interior on the parent component, and verifies Escape clears only the
  transient first-pick state without deleting either component or creating a
  spurious joint. It then repeats both face picks, chooses the in-app Rigid
  joint type, and verifies the persisted `C1 → C2` joint links two distinct
  imported components.
- The production native-file workflow (`tests/e2e/file-import-smoke.playwright.mjs`)
  opens **File → Import STL**, receives the browser's real file chooser, and
  imports a watertight 12-triangle cube into the isolated workspace.  This
  covers the user-facing chooser and client-side file-read path, not merely
  the STL parser.
- The production SVG workflow (`tests/e2e/svg-import-workflow.playwright.mjs`)
  opens **File → Import SVG**, uses the real chooser, changes the placement
  plane to XZ and the extrusion height to 8 mm, then verifies both the
  resulting solid and its retained editable sketch source.
- The production OBJ workflow (`tests/e2e/obj-import-options.playwright.mjs`)
  uses **File → Import OBJ**, selects centimetres and Ground placement, and
  verifies that a one-unit cube becomes 10 mm wide and is committed at the
  expected ground-centred occurrence position in the same import action.
- The production DXF workflow (`tests/e2e/dxf-import-options.playwright.mjs`)
  uses a real two-layer DXF through the browser chooser, selects YZ, inches,
  scale 2 and 6 mm height, then verifies the 50.8 mm converted outer radius,
  the resulting feature parameters and the retained editable sketch source.
- The production 3MF workflow (`tests/e2e/three-mf-import-smoke.playwright.mjs`)
  opens **File → Import 3MF** through the browser's native chooser and verifies
  that a packaged OPC/3MF model is decoded into its expected 9 vertices and
  3 triangles.  This specifically exercises the worker-safe XML parser used
  by production imports.
- The production STEP workflow (`tests/e2e/step-brep-import-smoke.playwright.mjs`)
  generates a real OCCT STEP B-rep, chooses **File → Import STEP as Solid**
  through the native chooser, and verifies that the source is retained as an
  editable `stepbody` timeline feature rather than downgraded to display mesh.

- 71 visible CREATE / MODIFY / ASSEMBLE leaf commands have a real
  `runCommand` case and begin an operation; no ribbon item is a dead route.
- Switching commands cancels an unconfirmed feature dialog rather than losing
  focus behind it; Ribbon buttons carry `data-cmd` and obey the command gate.
- Numeric dialog focus preserves Enter and Escape.  The direct-edit families
  (round, shell, press/pull, face fillet, hole, extrude, sweep, loft, move
  face, draft) have explicit Enter-commit and Escape-cancel branches.
- Global Undo/Redo is guarded by `Ctrl+Z`, `Ctrl+Y` / `Ctrl+Shift+Z`.
- The isolated browser workflow (`?ui-test=1`) proves box numeric input,
  Escape, timeline feature count and undo/redo without touching a user's
  autosaved document.

## Still not honestly covered by automated browser interaction

These remain planned manual/WebGL cases, not claimed complete merely because
their command routing is tested:

1. Pointer drag-gizmo verification for Move, Press Pull, Edit Face, Scale and
   Draft on faces/edges at multiple camera angles.
2. Low-frequency Construct methods beyond the high-risk combinations already
   exercised (for example plane-through-two-edges variants and point-normal
   variants) still need individual canvas evidence.
3. Every CREATE feature's profile/path/axis pick sequence and its result when
   chained into a later Modify feature (e.g. sketch -> extrude -> fillet ->
   pattern -> combine).
4. Every Assembly joint/contact/motion command's two-component pick sequence,
   including cancel at every selection stage.
5. Long-running cross-browser and large-model import validation.  Native
   chooser workflows for STL, STEP, SVG, OBJ, DXF, and 3MF are now covered;
   format parsers themselves are covered in their format-specific tests.

The four rows above are deliberately retained as open work until real canvas
events and resulting geometry are measured, not just DOM/source contracts.
