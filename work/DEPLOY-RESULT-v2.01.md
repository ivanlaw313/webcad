# DEPLOY-RESULT v2.01 (BD-2101)

- **When (HKT):** 2026-09-25 09:44:27 HKT
- **Live:** https://cad.neuralworkshk.com/?v=201
- **Stamp:** `v2.01-20260925-094241`
- **Entry:** `index-DYCQfLkE-r2.js`
- **MD5:** `0127701c9254eadb60396a1b2f04882c` (live matched)
- **SW CACHE:** `webcad-v2.01`
- **PR:** https://github.com/ivanlaw313/webcad/pull/222 (squash → feat/native-car-stage1-20260906 @ eb09409)
- **Prev nginx root:** `v2.00-20260925-090839`

## What changed
1. `src/sketch/csketch.ts` — all user-visible status / setTool tips SC→港繁 (keep 嘅／喺／唔／係／嚟／仲要／揀).
2. `src/components/MultiViewPanes.tsx` — empty pane + split/quad banner + pane labels SC→港繁.
3. `src/i18n.ts` — STATUS_PHRASES_X TC keys + legacy SC for MultiView / CSketch tips.
4. Version pin `APP_VERSION=2.01` / `public/sw.js` CACHE `webcad-v2.01` (manual; **not** release:build).
5. Test `tests/grok-qa-v2.01-bd2101-csketch-tips-tc.test.mjs` (+ prior grok-qa version bump).

## Verify
- curl sw.js → CACHE webcad-v2.01
- entry md5 live == local
- index script src = `index-DYCQfLkE-r2.js`
- bundle contains `已清空草圖` / `此窗格暫無實體` / `2.01`

## Open bugs
- open = 0 (no new bugs this round)

## Suggested next
- 量測／材質高曝光殘留 SC；或四語 i18n message-catalog
- leftover: `store.ts` 仍有「可继续点击落点」類 SC（非 csketch 主路徑）
