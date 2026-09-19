# DEPLOY-RESULT v1.88

**Stamp:** `v1.88-20260919-164517`  
**Entry:** `index-8cg3PHpR-r2.js`  
**MD5:** `ed3ff86f0cfc1e611516653b1d87900a`  
**Commit:** `e616735` / PR [#188](https://github.com/ivanlaw313/webcad/pull/188)  
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.88` · nginx root `/var/www/webcad-releases/v1.88-20260919-164517`

## Summary
APP/SW → **1.88**.

| ID | Fix |
|----|-----|
| BD-8701 | Fillet/face-fillet dialogs: `确定`→`確定`, `圆角`→`圓角`, `规则圆角`→`規則圓角`, `面圆角`→`面圓角` |
| BD-8601b | Physics HUD/propsReport `体积`→`體積` (undeployed from 1.87, now live) |
| BD-8601 | Ribbon `外觀顏色` (from 1.87, retained) |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.88'`; badge Ut=`1.88`
- Bundle: `規則圓角` / `面圓角` / `確定（` / `體積` / `外觀顏色`
- SC `外观颜色` absent
