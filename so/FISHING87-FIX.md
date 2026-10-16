# FISHING87-FIX

## Summary
**PRIORITY more43 cherry** (tests-only, bundle unchanged — same as F84 more42).
Cherry `ef905c37` → `76c97ab1` on tip `1085c40` **BEFORE nginx**.

## Live after cut
- Tip: `76c97ab100db5c61e37607181e78cea8d9a887f4` (fix/fishing87-behavior-ux → FF fix/sketch-face-copy)
- Stamp: `v2.20-20261016-233751`
- Bundle: `index-BdZ38Vhs-r2.js` (md5 `abd86b12fe6e0417d2be9dfe31622e3e`) — **unchanged** vs F86 (tests-only)
- Bak: `index-BdZ38Vhs-r2.js` / `v2.20-20261016-233223` (kept)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- more43 cherry: **yes** (`76c97ab1` ← `ef905c37` cherry-pick -x)

## more43
| | |
|--|--|
| Source | `test/unit-core16-more43` @ `ef905c37` |
| Soft-prep | `/workspace/webcad-qa/sketch-20261008/unit/more43-soft-prep.md` |
| File | `tests/core16-more43-behavior-sample.test.mjs` |
| Result | **16/16** PASS + tsc 0 on tip after cherry |

## Product
- No src product change this wave (tests-only OK per more43 hand-off / F84 pattern)
- MATERIALS / DENSITY_PREF SC kept (pinned in more43 always-hard)

## Tests
- core16-more43-behavior-sample **16/16** PASS
- fishing86-windtunnel-lazy-guard 3/3 PASS
- tsc --noEmit PASS

## Deploy
- Bak prior live BdZ38Vhs / 233223
- Soft-prep: more43 cherry **BEFORE** nginx
