# FISHING88-FIX

## Summary
Genuine product: App panel chunks use **lazySafe** (F86 WindTunnel pattern — no `reading 'default'` on 404).
Draft i18n Formal **无法开启模 → 无法开模** / TC **無法開模**; drop English undercut in SC key.

## Live after cut
- Tip: `13b2f4316e18b2cc567762fd2bcaf101ae0f49a0` (fix/fishing88-behavior-ux → FF fix/sketch-face-copy)
- Stamp: `v2.20-20261016-234555`
- Bundle: `index-BPlnpMNW-r2.js` (md5 `f76000b0376c8f25546cf56d14e40858`)
- Bak: `index-BdZ38Vhs-r2.js` / `v2.20-20261016-233751` (kept)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- more44 cherry: **no** (absent → F89)

## Product changes
| File | Change |
|------|--------|
| `src/App.tsx` | lazySafe for CSketch/Help/Palette/AI/Slice/History/Drawing/Physics/Aero |
| `src/i18n.ts` | draft Formal 倒扣（无法开模／無法開模） |
| `tests/fishing88-lazy-draft-formal.test.mjs` | hard asserts |

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No tip Formal invent / Formal chrome soft
- more44 absent → defer F89

## Tests
- fishing88-lazy-draft-formal 3/3 PASS
- fishing86-windtunnel-lazy-guard 3/3 PASS
- tsc --noEmit PASS

## Deploy
- Bak prior live BdZ38Vhs / 233751
- Soft-prep: more44 absent → no cherry before nginx
