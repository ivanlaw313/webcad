# V155 FIX PLAN — BUG-BD-5401 SURFACE「翻轉曲面」+ INSPECT TC

**Ship:** APP_VERSION **1.55** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.54 (PR #109) — SURFACE TC shipped but BOT-D opened **BUG-BD-5401**

## Steering (PRIORITY)
**BUG-BD-5401:** SURFACE ribbon missing label「翻轉曲面」(expected Traditional; other SURFACE labels PASS).  
Root cause: `reversesurf` lived in SURFACE **CREATE** without `quick`, so it was buried in the long CREATE ▾ list; SURFACE **MODIFY** only had 加厚/按拉／分割／合併 — BOT-D Modify dropdown check failed.

## Scan
| Item | Notes | Pick? |
|------|-------|------:|
| BUG-BD-5401 `翻轉曲面` not on SURFACE / MODIFY | Move to MODIFY + `quick: true` | **YES (ship)** |
| INSPECT / ANALYZE SC leftover | Landed in PR #111 (same APP_VERSION 1.55) | included |
| DRAWING `工程图` / SKETCH SC | Defer | later |
| MESH toast / DnD SC | Contracts pin SC; **do not** | no |

## Choice
1. **BUG-BD-5401:** Put「翻轉曲面」on SURFACE MODIFY ribbon (quick + dropdown).
2. **Also:** INSPECT/ANALYZE ribbon → Traditional Chinese (測量／干涉檢查／斑馬紋／質心／物理屬性／檢查擴展…) — PR #111.

## Fix
1. `src/ribbon.ts`: move `reversesurf` CREATE → SURFACE **MODIFY** with `quick: true`, label **翻轉曲面**.
2. Contract asserts SURFACE MODIFY contains `id: 'reversesurf', label: '翻轉曲面'` (and not SC `翻转曲面`).
3. Keep FORM/CREATE/MODIFY/ASSEMBLE/illegal/MESH/Finish/plane/`对称`→Symmetric intact.
4. APP_VERSION **1.55** (already set with INSPECT pass).

## Do not
- Convert MESH DnD/toast SC pins.
- Mass-convert SKETCH / DRAWING / SOLID CREATE residual SC.
- Clobber `'对称': 'Symmetric'`.
