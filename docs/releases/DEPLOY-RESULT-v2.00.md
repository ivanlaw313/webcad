# DEPLOY-RESULT v2.00

**Stamp:** `v2.00-20260925-090839`
**Entry:** `index-BJ1y5hvL-r2.js`
**MD5:** `409cdab8f1175fde155de72e739a1904`
**Commit:** `49eec96` / PR [#220](https://github.com/ivanlaw313/webcad/pull/220)
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v2.00` · nginx root `/var/www/webcad-releases/v2.00-20260925-090839`
**Prev:** `v1.99-20260919-190924`

## Summary
**v2.00 = BD-2001 closes BUG-BD-9901 / 9902 / 9903（display-style + IntroCard + 文檔單位）**

| ID | Fix |
|----|-----|
| BD-9901 | `VISUAL_STYLE_LABELS` 著色／隱藏邊／可見邊／線框；Viewport `B-rep 視覺樣式`；store `視覺樣式：…` |
| BD-9902 | IntroCard 全卡 SC→港繁；`index.html` title `代號` |
| BD-9903 | UnitDialog 已有 `文檔單位`；BrowserTree leaf 改 `文檔單位: mm / g` |
| i18n | STATUS_PHRASES_X TC + legacy SC keys |
| version | APP `2.00` · SW `webcad-v2.00` |

## Sample before → after
| Before (SC) | After (TC) |
|-------------|------------|
| `着色` / `隐藏边` / `线框` | `著色` / `隱藏邊` / `線框` |
| `B-rep 视觉样式` | `B-rep 視覺樣式` |
| `快速开始` / `手把手教学` / `第一个零件` | `快速開始` / `手把手教學` / `第一個零件` |
| `代号` | `代號` |
| BrowserTree `單位:` | `文檔單位:` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v2.00'`
- Badge / bundle `2.00` · entry `index-BJ1y5hvL-r2.js` · md5 `409cdab8f1175fde155de72e739a1904`
- Tests: v2.00 + v1.99 + v1.98 + v1.97 + brep-display = **30/30**; viewx2 **59/59**
- Browser: hard refresh `?v=200`（Chrome 開住，title 代號）

## Files
- `src/cad/viewModel.ts`, `src/components/Viewport.tsx`, `src/store.ts`
- `src/components/IntroCard.tsx`, `src/components/BrowserTree.tsx`
- `index.html`, `src/i18n.ts`, `src/version.ts`, `public/sw.js`
- `tests/grok-qa-v2.00-bd2001-display-intro-tc.test.mjs` + pin prior grok-qa / brep-display-contract
