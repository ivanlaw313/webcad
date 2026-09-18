# V137 FINAL — Shell success toast proper Chinese

**LIVE:** https://cad.neuralworkshk.com/ · **APP_VERSION 1.37** · stamp `v1.37-20260919-011751`  
**PR:** https://github.com/ivanlaw313/webcad/pull/75 @ `1822fc2` · entry `index-JIT6Q-vQ-r2.js` (md5 `51e5e3cb281bec0bbeb6351df6cae8de`)

## Root cause
EN `tStatus` used global `split/join` over short tokens (`已`→`Done: `, `抽壳`→`shell`, `壁厚`→`Wall`, `所选`→`selected `), carving the already-correct Chinese success toast into hybrid EN/CN.

## Fix
1. `shellSuccessStatus` Chinese CLEAN builder  
2. Long STATUS_PHRASES_X Chinese identity guards (Shell / Fillet / Chamfer)  
3. `tStatus` → left-to-right longest-match so guards actually protect  

## Strings (before → after under EN lang)
| Before (LIVE @1.36) | After (v1.37) |
|---------------------|---------------|
| `Done: shell Wall 2 (向内, 开 1 个selected 面, 切线链)` | `已抽壳 壁厚 2 (向内, 开 1 个所选面, 切线链开)` |
| Fillet hybrid `Done: …倒fillet…` | `已对 N 条棱 倒圆角 R…（时间轴可改）` |

## Ask solid bot
Retest **BX01** + **BX02** Shell **commit** on LIVE 1.37: toast language Chinese (no `Done:` / `shell Wall` / bare `selected`) **and** still CLEAN (no fallback/cavity/alt-opening).
