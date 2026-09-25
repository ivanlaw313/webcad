# DEPLOY-RESULT v1.94

**Stamp:** `v1.94-20260919-180447`
**Entry:** `index-qoRew3mG-r2.js`
**MD5:** `d4832a645c4f38c2e19a1e11e722dbe2`
**Commit:** `c5936f1` / PR [#205](https://github.com/ivanlaw313/webcad/pull/205)
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.94` · nginx root `/var/www/webcad-releases/v1.94-20260919-180447`

## Summary
APP/SW → **1.94**.

| ID | Fix |
|----|-----|
| BD-9301 status leftovers | store tips：`矩形陣列：設 X/Y 數量與間距 → 確定` / `鏡像：設鏡像面／偏移 → 確定` / 環形陣列 tips |
| Solid @1.93 toast | worker：`持久面名經上游變換以拓撲順序追蹤解析（真拓撲命名 S1-面）`（+ related S1/S2 warnings） |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.94'`
- Bundle: `矩形陣列：設` / `鏡像：設鏡像面` / `持久面名經上游變換` / no SC status tips
- Tests: `grok-qa-v1.94-bd9301-status-topo-tc.test.mjs` (5/5 green)
- Browser: hard refresh `?v=194`

## Files
- `src/store.ts`
- `src/worker/cad.worker.ts`
- `src/i18n.ts`
- `src/version.ts`
- `public/sw.js`
- `tests/grok-qa-v1.94-bd9301-status-topo-tc.test.mjs`
