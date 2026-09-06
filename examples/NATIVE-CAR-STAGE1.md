# Native car stage 1 — incomplete vehicle

Base: Windows-reviewed 20d029880a874480180b364c4dfb751b7a5b61d9. Keep the six-spoke wheel-rig regression unchanged.

`node examples/native-car-stage1.mjs examples/Native-Car-Stage1.json` regenerates the procedural seed (120/50/90 mm). This is scripted native sketch/feature authoring, not a sequence claimed to have been drawn manually. No GLB, STEP, mesh or imported body is used.

`Native-Car-Stage1-UI-140-60-100.json` was produced by actual browser parameter edits and product Save/Share. WheelDiameter is `Wheelbase*3/7`; its stable reference resolves to the Wheelbase parameter ID. This file contains the six seed views and an additional user-created `UI Top saved` bookmark.

Coordinates: front −X, rear +X, Z up, Y width; wheel stations ±Wheelbase/2, contact plane Z=0. Native XZ sketches extrude along −Y from the positive-Y wheel/body/cabin face. Mirror is XZ; five-spoke circular pattern axis is +Y, with its origin bound to FrontStation and AxleHeight. Rectangular pattern repeats along +X. All body, cabin and window vertices have editable driving location dimensions referring to master parameter IDs. The two wheel-arch circles retain equal-radius and station constraints. Projection/snap tools remain available; this seed does not claim projected inter-sketch associativity where it instead uses shared parameters.

Named-view positions/up vectors use Three render coordinates [CAD X, CAD Z, −CAD Y]. Front (−X), Rear (+X), Left (−Y), Right (+Y), Top (+Z), Isometric. Top up is [0,0,−1] in render coordinates, never parallel to the viewing ray. Save also retains zoom and orthographic/perspective projection. ViewCube labels show CAD axes; the existing generic navigation Front/Right buttons retain their original application convention. Use the explicitly signed vehicle bookmarks for vehicle inspection.

Scope: four native five-spoke wheels, master body silhouette, two real wheel-arch Cuts, cabin and through-window opening. These are rough blockout proportions, not measured Fusion v11 body dimensions. Full car, glazing, separate tires/materials, suspension, axles, fillets, body surfacing, lights, wing, exhaust, intake and mirrors are unfinished. Wheels are separate disconnected solids within the current native aggregate, not articulated components.

Validated parameter points: 120/50/90 and 140/60/100 mm. These are not a claim of unlimited valid parameter ranges. Driver left/right is the Windows v11 convention; no new Fusion operation was performed on Mac. Human IME, physical trackpad and native Chrome 125% remain untested.

Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm test:all`, then `pnpm preview --host 127.0.0.1 --port 4173`. Use `?ui-test=1` in an isolated test tab and File > Open for either native JSON.

Meshfit investigation: `node --experimental-strip-types --import ./tests/register-resolver.mjs scripts/meshfit-interleaved.mjs /path/to/20d0298-checkout`. Same fixed 29,760-triangle input, three warmups per version, 20 interleaved AB/BA repetitions. No timing threshold was relaxed.
