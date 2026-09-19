# DEPLOY-RESULT v1.98

**Stamp:** `v1.98-20260919-185802`
**Entry:** `index-DaovblWv-r2.js`
**MD5:** `492e8a14aa8d48f04588232a5d0d0ebe`
**Commit:** `6c1f08e` / PR [#216](https://github.com/ivanlaw313/webcad/pull/216)
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.98` · nginx root `/var/www/webcad-releases/v1.98-20260919-185802`

## Summary
**v1.98 = BD-9602 + locale-v197 caxis tip token + Viewport residuals TC**

| ID | Fix |
|----|-----|
| BD-9602 | `setObjectVis` status `全部构造轴：显示` → `全部構造軸：顯示`（草圖／原點構造面／關節 同步） |
| locale-v197 | axis tip prepend `構造幾何 ·` → e.g. `構造幾何 · 構造軸 · 過圓柱/錐面 — 🎯 順序拾 一個圓柱面`（title 構造軸／mode 軸 不變） |
| Viewport | mate 軸／間隙／揀面／螺絲／翻轉；梁 圓截面／報告；截圖 status |
| store | 按孔配螺絲 status tips TC |
| version | APP `1.98` · SW `webcad-v1.98` |

## Sample before → after
| Before (SC / missing) | After (TC) |
|----------------------|------------|
| `全部构造轴：显示` | `全部構造軸：顯示` |
| `構造軸 · 過圓柱/錐面 — 🎯 順序拾 一個圓柱面`（缺 構造幾何） | `構造幾何 · 構造軸 · 過圓柱/錐面 — 🎯 順序拾 一個圓柱面` |
| `X轴` / `按孔配螺丝` / `间隙` | `X軸` / `按孔配螺絲` / `間隙` |
| `3D 视图未就绪，无法截图` | `3D 視圖未就緒，無法截圖` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.98'`
- Badge / bundle `1.98` · entry `index-DaovblWv-r2.js`
- Bundle: `全部構造軸` / `構造幾何 ·` / `按孔配螺絲`
- Tests: `grok-qa-v1.98-bd9602-caxis-tip-tc` + v1.96/v1.97 = **16/16**
- Browser: hard refresh `?v=198`

## Files
- `public/sw.js` `src/version.ts` `src/store.ts` `src/App.tsx`
- `src/components/Viewport.tsx`
- `tests/grok-qa-v1.98-bd9602-caxis-tip-tc.test.mjs` (+ version pin bumps)
