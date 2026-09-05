# Persistent rectangle and native wheel rig — Mac review 2026-09-06

Base: `bc20ac39354cf1780eec891486cdd5c0e63ac3af`. No deployment.

## Reproduce locally

Validated runtime: Node 26.5.0, pnpm 11.19.0, macOS arm64.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
```

Open http://127.0.0.1:4173/?ui-test=1 in a separate test tab. File → Open loads the native JSON examples. This URL starts a blank test document; preserve normal user tabs.

```sh
node examples/wheel-rig.mjs Native-Wheel-Rig.json
node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/persistent-rectangle.test.mjs tests/rectangle-transaction.test.mjs tests/wheel-rig-kernel.test.mjs tests/windows-review-regression.test.mjs
pnpm test:all
```

The full suite has a pre-existing deployment-script contract failure: test expects `if not PASSWORD:` but the existing script checks KEY and PASSWORD. The CAD task does not modify or execute deployment scripts. Record this as FAIL, not a passing full suite.

## Native files and authorship

- `wheel-rig.mjs`: deterministic native-feature seed authoring script. Existing CAD sketch, extrude, Cut, circular Pattern, Mirror and rectangular Pattern do the modeling. No new kernel, imported mesh or GLB.
- `Native-Wheel-Rig-140-60-100.json`: saved by real browser UI after changing Wheelbase 120→140, WheelDiameter 50→60, CarWidth 90→100; zero diameter rejection and Undo/Redo tested.
- `Persistent-Rectangle-Parametric.json`: created by real UI origin snap, keyboard 60×40, edited width to 80, bound d1 to Width and d2 to d1/2, then changed Width to 100. Saved result 100×50, origin (0,0), DOF 0.

The wheel rig is an abstract A/B-station coupon, NOT a completed car. Station separation is X; wheel axes/track width are Z in this fixture. Wheel planes are XY, mirror plane XY. No v8 front/rear claim. CarWidth is the outside wheel span; wheels are 8 mm thick. Rim opening is 0.7×WheelDiameter, hub is 0.3×WheelDiameter, spoke reach 0.44×WheelDiameter, six spokes. Arch diameter is WheelDiameter+4. The coupon is intentionally narrow (20 mm). Operating sample range tested: WB 120–140, WD 50–60, CW 90–100; no claim over arbitrary dimensions or wheel overlap.

Sketch dimensions capture parameter IDs and other dimension IDs. Existing shape-index references retain the existing remapping behavior; this is not a new general topology naming system. Two-point quick rectangles are covered. Center rectangles and other creation tools keep their existing behavior.

## Browser replay

1. New XY sketch → R → click near origin → enter width/Tab/height/Enter. Check four H/V relations, origin coincidence, two driving dimensions and DOF 0.
2. Change width 60→80; Undo→60, Redo→80; drag anchored/full-constrained corner and check unchanged geometry. Finish, save JSON, reopen and edit sketch.
3. Bind width to a user parameter Width and height to d1/2. Finish; change Width to 100; reopen and check 100×50. JSON must retain `paramId` and `refs.d1 = dimension:<width constraint ID>`.
4. Load wheel rig seed; change each main parameter individually, waiting for rebuild. Check both arch Cuts and four wheels with six spokes. Set WD=0: reject and retain last valid parameters/geometry/history. Undo must revert the prior successful parameter edit, not the failed attempt; Redo restores it.
5. Save/reopen JSON; double-click concentric source; verify diameters 60/42/18, DOF 0; click wheel face in solid mode and inspect real face properties.

Human IME, physical trackpad gestures, native Chrome 125%: UNVERIFIED, separate tests required. Browser automation and keyboard simulation do not count as human acceptance. Fusion v8 direction remains pending Windows. Full vehicle rebuilding remains pending.
