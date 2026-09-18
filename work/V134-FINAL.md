# WebCAD v1.34 FINAL — Large DXF / schematic import

**Deploy:** PR #69 · stamp `v1.34-20260918-230425` · LIVE **1.34**  
**Deploy notes:** `/workspace/webcad-qa/out/DEPLOY-RESULT-v1.34.md`  
**Plan:** `/workspace/webcad-qa/out/V134-FIX-PLAN.md`

## Root cause / hotspot
1. **O(n²) segment chaining** on loose LINE/ARC segs froze the main thread (~10s at 20k disconnected LINEs).
2. Residual AL1-class risk: soft sketchOnly could be unchecked → mass extrude OOM; TEXT×2 construction shapes exploded geometry.
3. Double parse (dialog + confirm) wasted main-thread work; no progress/cancel/reject caps.

## Fix shipped
| Item | Detail |
|------|--------|
| Spatial-hash chain | Endpoint grid `CELL=0.05` matching `near` — 20k LINEs ~125ms |
| sketchOnly harden | Soft 32/12/0.5MB; force lock 200/80/2MB; reject 8MB / 100k ents |
| TEXT markers | Cap 128 construction markers; all labels kept |
| UX | Parse cache, busy/progress, cancel epoch, dialog stats + locked checkbox |
| Version | `APP_VERSION = 1.34` |

## Tests
- `tests/grok-qa-v1.34-dxf-large-import.test.mjs` — PASS (spatial, heuristics, AL1, cancel, wiring)
- v1.21 TEXT + v1.22 sketchOnly — PASS (thresholds updated)
- Shell v1.28–v1.33 — PASS
- Illegal UX contracts — assertions green (file-level font URL noise pre-existing)

## Suggested retest
- **Sketch bot:** File → 导入 DXF → `/workspace/AL1-800A-配电箱.dxf` (or larger schematic). Expect: parse progress, sketchOnly ON (force if huge), insert as one sketch + labels, no Chrome OOM / multi-second freeze.
- Optional stress: synthetic many-LINE DXF should stay interactive.
- BOT-D / UI bot **not** required for this train.
- PR #68 remains optional for later (ASSY File harden; bug CLOSED @1.33).

## LIVE
- https://cad.neuralworkshk.com/ · bundle `index-6PXsw2Pl-r2.js` · md5 `a94e6d6cd60aa1692c7ba6ae5b7d6156`
