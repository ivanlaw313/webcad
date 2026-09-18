# V138 FINAL — Solid-op success toasts proper Chinese

**LIVE:** https://cad.neuralworkshk.com/ · **APP_VERSION 1.38** · stamp `v1.38-20260919-022928`  
**PR:** https://github.com/ivanlaw313/webcad/pull/77 · entry `index-DMQ8m4My-r2.js` (md5 `bdb6eb871760f73ee469a44c7204e50d`)

## Root cause
EN `tStatus` short tokens (`已`→`Done: `, `拉伸`→`extrude`, `实体`→`body`, `旋转`→`revolve`, …) plus a few whole-string EN translations carved Extrude/Cut/Boolean/Fuse (and related) success toasts into hybrid EN/CN after v1.37 only fixed Shell/Fillet/Chamfer.

## Fix
1. `extrudeSuccessStatus` / `multiProfileExtrudeStatus` / `booleanSuccessStatus` / `newBodySuccessStatus` builders  
2. Long STATUS_PHRASES_X Chinese identity guards (incl. overriding prior EN whole-strings)  
3. Keep v1.37 LTR longest-match; no Shell CLEAN / join-budget / DXF regress  

## Strings (before → after under EN lang)
| Op | Before (LIVE @1.37) | After (v1.38) |
|----|---------------------|---------------|
| Extrude | `Done: extrudeto make a body — real  OCCT B-rep` | `已拉伸出实体 — 真实 OCCT B-rep` |
| Cut | `Cut (Boolean subtract) done — true OCCT B-rep` | `已切割（布尔减）— 真实 OCCT B-rep` |
| Boolean/Fuse | `Done: boolean: 活动body…` / `Merged : …` | `已实体布尔：…` / `已合并：活动实体 …` |
| Shell (unchanged) | Chinese CLEAN | Chinese CLEAN |

## Ask solid / UI bot
Light **solid smoke** on LIVE 1.38: Extrude / Cut / Boolean(Fuse) / Chamfer toasts Chinese (no `Done:`). Shell still CLEAN. Optional UI/BOT-D.
