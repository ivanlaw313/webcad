# DEPLOY-RESULT v1.95

**Stamp:** `v1.95-20260919-181633`
**Entry:** `index-DEIzixLN-r2.js`
**MD5:** `46df6173b7f8ec657aea584abef708d8`
**Commit:** `1027374` / PR [#207](https://github.com/ivanlaw313/webcad/pull/207)
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.95` · nginx root `/var/www/webcad-releases/v1.95-20260919-181633`

## Summary
APP/SW → **1.95**.

| ID | Fix |
|----|-----|
| tip Record residuals | store openFeatDlg tips：`移動/複製：設 dx/dy/dz + 繞Z角 → 確定` / `縮放：設比例 → 確定` / `整體偏移：設距離…` / `長方體：設長/寬/高 → 確定` / `構造軸：選方向…` / gearbox·sheetmetal·automatedmodel 等 |
| Viewport high-vis | mate/printbed/gearbox/marquee status + 鋼/鋁/不鏽鋼 rules |
| store status leftovers | 鏡像／陣列／選擇 ESC 提示 SC→TC |

## Sample before → after
| Before (SC) | After (TC) |
|-------------|------------|
| `移动/复制：设 dx/dy/dz + 绕Z角 → 确定` | `移動/複製：設 dx/dy/dz + 繞Z角 → 確定` |
| `长方体：设长/宽/高 → 确定` | `長方體：設長/寬/高 → 確定` |
| `构造轴：选方向 X/Y/Z + 经过点 → 确定…` | `構造軸：選方向 X/Y/Z + 經過點 → 確定…` |
| `输入目标速比 ≥1` | `輸入目標速比 ≥1` |
| `配合类型（包围盒级窄版…` | `配合類型（包圍盒級窄版…` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.95'`
- Bundle: `移動/複製：設` / `長方體：設長` / `構造軸：選方向` / `輸入目標速比` / `配合類型（包圍盒`
- Tests: `grok-qa-v1.95-tip-dialog-tc.test.mjs` (6/6) + v1.94 (5/5) = 11/11 green
- Browser: hard refresh `?v=195`

## Files
- `src/store.ts`
- `src/components/Viewport.tsx`
- `src/i18n.ts`
- `src/version.ts`
- `public/sw.js`
- `tests/grok-qa-v1.95-tip-dialog-tc.test.mjs`
