# FISHING84-FIX

## Summary
**PRIORITY more42 cherry** (tests-only, bundle unchanged — same as F80 more41).
Cherry `39fb468f` → `bd4fa4db` on tip `a166807` **BEFORE nginx**.

## Live after cut
- Tip: `5cdb1f1ecb1ec73212059ce031cfd53120864e94` (fix/fishing84-more42-cherry → FF fix/sketch-face-copy)
- Stamp: `v2.20-20261016-232008`
- Bundle: `index-BYceU1jz-r2.js` (md5 `26ce76f96826f83ce7c92f664630fb35`) — **unchanged** vs F83 (tests-only)
- Bak: `index-BYceU1jz-r2.js` / `v2.20-20261016-231506` (kept)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- more42 cherry: **yes** (`bd4fa4db` ← `39fb468f` cherry-pick -x)

## more42
| | |
|--|--|
| Source | `test/unit-core16-more42` @ `39fb468f` |
| Soft-prep | `/workspace/webcad-qa/sketch-20261008/unit/more42-soft-prep.md` |
| File | `tests/core16-more42-behavior-sample.test.mjs` |
| Result | **15/15** PASS + tsc 0 on tip after cherry |

## Product
- No src product change this wave (tests-only OK per brief)
- MATERIALS / DENSITY_PREF SC kept (pinned in more42 always-hard)

## Tests
- core16-more42-behavior-sample **15/15** PASS
- fishing83-demold-ux-leftover 3/3 PASS
- tsc --noEmit PASS

## Deploy
- Bak prior live BYceU1jz / 231506
- Soft-prep: more42 cherry **BEFORE** nginx
