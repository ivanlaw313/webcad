# DEPLOY-RESULT v1.71

**Date:** 2026-09-19 13:24 HKT  
**PRs:**  
- https://github.com/ivanlaw313/webcad/pull/149 — LAB FEA/slice/pyramid/delface TC (MERGED) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** LAB 仿真／3D列印／更多基元／直接编辑扩展 residual SC → HK Traditional + SW CACHE bump  
**Note:** Boolean leftovers (來源／工具體／網格布爾) already live in v1.70/#146 — not redone.

## Ship contents
- LAB 仿真: **受力雲圖**／**風洞水洞**
- LAB 3D列印: **切層預覽**／**懸垂分析** (自動擺正／壁厚檢查 already v1.70)
- LAB 更多基元: **棱錐**
- LAB 直接编辑扩展: **刪面治癒**; tree／timeline／mark **刪面**; SlicePanel head **切層預覽**
- `public/sw.js` **CACHE=`webcad-v1.71`** + RELEASE comment; navigate network-first unchanged
- APP_VERSION **1.71** + contract `grok-qa-v1.71-fea-slice-pyramid-delface-traditional`

## Before → After
| Surface | v1.70 | v1.71 |
|---------|-------|-------|
| LAB 仿真 FEA | 受力云图 | **受力雲圖** |
| LAB 仿真 wind | 风洞水洞 | **風洞水洞** |
| LAB 3D列印 slice | 切层预览 | **切層預覽** |
| LAB 3D列印 overhang | 悬垂分析 | **懸垂分析** |
| LAB 更多基元 | 棱锥 | **棱錐** |
| LAB 直接编辑 | 删面治愈 | **刪面治癒** |
| SW CACHE | `webcad-v1.70` | **`webcad-v1.71`** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-BApUDm1E-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.71-20260919-132223` |
| Previous (kept) | `/var/www/webcad-releases/v1.70-20260919-131624` |
| nginx root | **sites-available + sites-enabled** → v1.71 release |
| current symlink | → `v1.71-20260919-132223` |
| entry md5 | `fedcd2eef47c1988d07137e4e57ddf5d` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.71-20260919-132223;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.71-20260919-132223;
```

## Verification
- Public entry `index-BApUDm1E-r2.js` ✓ md5 match ✓
- Live SW `CACHE = 'webcad-v1.71'` ✓
- Live contains 受力雲圖／切層預覽／棱錐／刪面治癒／風洞水洞／懸垂分析／來源體／網格布爾／畫布／貼花／插入STL网格／`1.71` ✓
- Retained: 插入STL网格／導出STL／裝配工程圖／尺寸已拒絕／選擇／爆炸視圖／3D列印／螺紋桿／中間平面／Boolean leftovers ✓

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once (or Clear site data), then hard refresh
2. Version badge **1.71**
3. 🧪實驗室 → 仿真：**受力雲圖**／**風洞水洞**
4. 🧪實驗室 → 3D列印：**切層預覽**／**懸垂分析**
5. 🧪實驗室 → 更多基元：**棱錐**
6. 🧪實驗室 → 直接编辑扩展：**刪面治癒**
7. Regress: 插入STL网格, 畫布／貼花, 來源／工具體／網格布爾, 構造擴展 under 實驗室, ZH chrome
