# DEPLOY-RESULT v1.63

**Date:** 2026-09-19 12:11 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/131 — MERGED → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** Shell success toast + component-boolean bake chip → HK Traditional (Solid@1.62 SC leftovers)

## Root cause
Solid bots @v1.61/v1.62 still saw Simplified toast/chip fragments:
- chip: 「烘焙为零件实体」
- Shell: 「已抽壳 壁厚 … (向内, 开 1 个所选面, 切线链开)」

Builders lived in `src/ui/featureStatus.ts` (`shellSuccessStatus`) and bake `statusAction.label` in `src/store.ts`, with SC identity guards in `STATUS_PHRASES_X`.

## Ship contents
- `shellSuccessStatus` → **已抽殼／向內／兩側／封閉實體／開 N 個所選面／切線鏈開**
- Bake chip + closely-related guidance → **烘焙為零件實體** / **已烘焙入零件時間軸，可圓角/抽殼**
- Shell dialog direction / tangent-chain fragments → TC
- i18n TC identity guards + legacy SC retained
- APP_VERSION **1.63** + contract `grok-qa-v1.63-shell-bake-traditional`
- Keeps MESH SC pins / DRAWING 裝配工程圖 / SKETCH 直線／完成草圖 / illegal 尺寸已拒絕 / SELECT 選擇 / SHEET/PLASTIC / ZH chrome

## Before → After
| Surface | v1.62 (Solid observed) | v1.63 |
|---------|------------------------|-------|
| Bake chip | **烘焙为零件实体** | **烘焙為零件實體** |
| Shell success | **已抽壳 壁厚 1.5（向内，开 1 个所选面，切线链开）** | **已抽殼 壁厚 1.5（向內，開 1 個所選面，切線鏈開）** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-pckrjmPN-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.63-20260919-121108` |
| Previous (kept) | `/var/www/webcad-releases/v1.62-20260919-120007` |
| nginx root | **sites-available + sites-enabled** → v1.63 release |
| current symlink | → `v1.63-20260919-121108` |
| entry md5 | `ac3b0ab6208a3c704dd41a564beb3433` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.63-20260919-121108;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.63-20260919-121108;
```

## Verification
- Public entry `index-pckrjmPN-r2.js` ✓ md5 match ✓
- Live contains `1.63`, 烘焙為零件實體／已抽殼 壁厚／向內／個所選面／切線鏈開 ✓
- Live retains 裝配工程圖／尺寸已拒絕／插入STL网格／選擇 ✓
- Contracts v1.63 + related shell/bake static **PASS**

## BOT verify steps (hard refresh)
1. Version badge **1.63**
2. Shell commit success toast uses **已抽殼…向內…開…個所選面…切線鏈開** (not SC)
3. Component boolean bake chip **烘焙為零件實體**
4. Regress: MESH insert STL SC, DRAWING 裝配工程圖, illegal 尺寸已拒絕, SELECT 選擇
