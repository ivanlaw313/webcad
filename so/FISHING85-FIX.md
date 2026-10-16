# FISHING85-FIX

## Summary
Genuine Formal product: user statuses **重復 → 重複** (texture/mesh/loft; Viewport toolbar already 重複).
Demold EN **Draft accessibility → Demold Accessibility**; draft legend drop English **undercut**.

## Live after cut
- Tip: `dcec12ca329492ee3d32b8140855d47b0f48f7df` (fix/fishing85-behavior-ux → FF fix/sketch-face-copy)
- Stamp: `v2.20-20261016-232559`
- Bundle: `index-lwNuJHc--r2.js` (md5 `c836bd678ac3b62ea0cfaf16bf174878`)
- Bak: `index-BYceU1jz-r2.js` / `v2.20-20261016-232008` (kept)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- more43 cherry: **no** (absent → F86)

## Product changes
| File | Change |
|------|--------|
| `src/store.ts` | texture/mesh/loft statuses 重複 |
| `src/i18n.ts` | keys 重複密度; 脫模可達性 Demold EN; 關閉脫模可達性 EN |
| `src/components/Viewport.tsx` | draft legend 倒扣（無法開模） |
| `tests/fishing85-chongfu-formal.test.mjs` | hard asserts |
| `tests/fishing83-demold-ux-leftover.test.mjs` | undercut assert updated |

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No tip Formal invent / Formal chrome soft
- more43 absent → defer F86

## Tests
- fishing85-chongfu-formal 3/3 PASS
- fishing83-demold-ux-leftover 3/3 PASS
- tsc --noEmit PASS

## Deploy
- Bak prior live BYceU1jz / 232008
- Soft-prep: more43 absent → no cherry before nginx
