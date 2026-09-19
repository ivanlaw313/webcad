# DEPLOY-RESULT v1.84

**Date:** 2026-09-19 16:03 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/178 (MERGED `cef4148`) → `feat/native-car-stage1-20260906`  
**Commit:** `768f42a` fix(qa): v1.84 BD-8201/8301-03 TC + mesh toast + hist.* + jev-qa  
**Site:** https://cad.neuralworkshk.com/

## Choice
Close BOT-D @1.83 residual SC under 繁體: profile fields, nav/timeline, mesh panel, HistoryPanel confirms, and MeshFit toast tail `网格参数化／重建为` → `網格參數化／重建為`. Keep shipping BD-8201 宽→寬 + BD-8301/02/03. APP/SW → **1.84**. Also land `tools/jev-qa` (`PYTHONPATH=tools`). Do not re-ship 1.83.

## Keys migrated
| Prefix | Count |
|--------|------:|
| Catalog keys / locale | **1314** (parity ×4) |
| `hist.*` (panel + confirms) | **21** (`restoreConfirm` / `deleteConfirm` / `readFail` new) |
| STATUS_PHRASES_X TC chrome | 寬／確定／移動/旋轉／繞X°／體積／網格參數化… |
| tc2sc | 寬→宽 · 繞→绕 · 棄→弃 |

## Fixes
| Item | Detail |
|------|--------|
| BD-8201 | Viewport `tStatus('寬')` (was `宽`); CommandDialog OK `確定` |
| BD-8301 | Sketch/nav `顯示`; Timeline `並`; aria `外觀與出圖` |
| BD-8302 | Mesh bar `移動/旋轉` · `繞X°` · `↺歸零` · `tStatus('體積')` |
| Toast | `cad.worker` `網格參數化：重建為…` (grep-clean vs `网格\|参数化\|重建为`) |
| BD-8303 | HistoryPanel → `hist.restoreConfirm` / `deleteConfirm` / `readFail` |
| jev-qa | `tools/jev-qa` + symlink `tools/jev_qa`; SUMMARY notes `PYTHONPATH=tools` |
| Pins | 插入STL网格 · 實驗室 · 尺寸已拒絕 · 日本語 · JA tool.* · HelpPanel · box JP · File/Browser TC |

## How to verify
1. Hard-refresh → badge **1.84**; DevTools SW = `webcad-v1.84`
2. 繁體 → 型材 L角鐵 fields **寬／高／厚／長**; OK **確定**
3. Mesh select → bar **移動/旋轉** · **繞X°** · **↺歸零** · **體積** (not 移动/体积)
4. MeshFit / param convert toast contains **網格參數化／重建為** (not 网格参数化／重建为)
5. 檔案 → 版本歷史… dialog TC; restore confirm **確定還原**

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `cef4148` |
| Feature SHA | `768f42a` |
| Release dir | `/var/www/webcad-releases/v1.84-20260919-160155` |
| Entry | `index-BWo-7OWe-r2.js` |
| MD5 | `b49d8202aaf6ca63887ab48833abe51a` |
| SW CACHE | `webcad-v1.84` |
| Tests | `tests/grok-qa-v1.84-*.mjs` **12/12** |
