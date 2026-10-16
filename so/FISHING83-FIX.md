# FISHING83-FIX

## Summary
F82 leftover UX: access info-card close **關閉可達性分析 → 關閉脫模可達性**.
Draft legend typo **無法開啟模 → 無法開模**. 檢查擴展 access tip aligned with INSPECT.

## Live after cut
- Tip: `3c370fb513aed3090ffe8b919b52e6b8e176c032` (fix/fishing83-behavior-ux → FF fix/sketch-face-copy)
- Stamp: `v2.20-20261016-231506`
- Bundle: `index-BYceU1jz-r2.js` (md5 `26ce76f96826f83ce7c92f664630fb35`)
- Bak: `index-2SJnc8l1-r2.js` / `v2.20-20261016-230832` (kept)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- more42 cherry: **no** (soft-prep in progress, not READY at nginx → F84)

## Product changes
| File | Change |
|------|--------|
| `src/components/Viewport.tsx` | close title 關閉脫模可達性; draft legend 無法開模 |
| `src/ribbon.ts` | 檢查擴展 access tip align |
| `tests/fishing83-demold-ux-leftover.test.mjs` | hard asserts |

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No tip Formal invent / Formal chrome soft
- more42: test file exists uncommitted on BOT-D WT — **not READY** → defer F84

## Tests
- fishing83-demold-ux-leftover 3/3 PASS
- fishing82-access-demold-ux 3/3 PASS
- tsc --noEmit PASS

## Deploy
- Bak prior live 2SJnc8l1 / 230832
- Soft-prep: more42 not READY → no cherry before nginx
