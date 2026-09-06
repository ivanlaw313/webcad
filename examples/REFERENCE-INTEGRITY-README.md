# Reference integrity review — 2026-09-06

Base: 2493d71e53db54482cd8aa3ab979d768f07c5029. Branch: fix/sketch-reference-integrity-20260906. No deployment.

`Reference-Integrity-Two-Rectangles.json` is an explicitly assembled regression fixture: the original Windows 80×40 rectangle plus the Windows dependent rectangle, restoring the missing original geometry/dimensions and remapping the second contour's shape indices. It is not claimed to have been drawn in this Mac session.

`Reference-Integrity-UI-100-50.json` is the actual product payload exported after real browser actions: open fixture, enter sketch, select source edge and Delete (rejected), edit d1 from 80 to 100, Undo to 80/40, Redo to 100/50, Trim source (rejected), finish sketch, Save/Share. The in-app browser did not create a filesystem download; the product's clipboard Share URL was decoded from gzip to obtain the identical buildProjectPayload JSON. The resulting file was reopened through File → Open.

`tests/fixtures/reference-integrity/Windows-P1-Dangling-Dimension.json` is the untouched invalid Windows fixture. File → Open must reject it before replacing the current model.

## Reproduce

Node 26.5.0 / pnpm 11.19.0, macOS arm64:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm preview --host 127.0.0.1 --port 4173
node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/sketch-reference-integrity.test.mjs tests/parameter-usage.test.mjs
pnpm test:all
```

Use `http://127.0.0.1:4173/?ui-test=1` in a separate test tab. Open the two-rectangle fixture, double-click the sketch tree entry, select an edge on the larger rectangle and Delete. Both rectangles and all 13 constraints remain; status identifies d3 → d1 / dimension:k6. Edit d1 to 100: both d2 and d3 become 50. Undo and Redo must restore 80/40 and 100/50 respectively. Trim on the larger rectangle also rejects without consuming history. Reopen the valid saved JSON: dimensions and DOF 2 survive.

The integration suite imports the complete Zustand store and actual PlaneGCS solver. It does not extract action functions. The Node adapter substitutes the browser worker transport only: sketch-only rebuilds return an empty mesh; solid rebuilds are not claimed by this adapter. Existing wheel-rig tests separately run the real OCCT worker, and browser tests use the real worker.

Check 1280×720 and 1366×900: Fit and Look At reserve palette/top/bottom space. All four dimension labels must be clickable. Open the native wheel rig: circle dimensions show only the three driving labels (no duplicate automatic diameter). Parameter usage includes direct and indirect dependencies; hover the count to see their names.

Physical IME, physical trackpad gestures and native Chrome 125% are UNTESTED. Automated input does not count as human acceptance.
