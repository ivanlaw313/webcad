# DEPLOY-RESULT v1.70

**Date:** 2026-09-19 13:15 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/145 — MERGED → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** CREATE/MODIFY/PRINT residual ribbon labels → HK Traditional + SW CACHE bump

## Ship contents
- ribbon CREATE: **面上草圖／面加螺紋／內螺紋孔**
- ribbon MODIFY／LAB: **移動面／全棱圓角／圓柱曲面貼花／草圖輪廓分割**
- LAB 更多基元: **圓管／圓角盒／圓頂／半圓柱**
- LAB 装配辅助／3D列印／投影: **透視／自動擺正／壁厚檢查／投影到圓柱面**
- Timeline / BrowserTree: **內螺紋孔／面外螺紋／移動面／曲面貼花**
- i18n EN_LABEL TC keys (legacy SC retained)
- `public/sw.js` **CACHE=`webcad-v1.70`** + RELEASE comment; navigate network-first unchanged
- APP_VERSION **1.70** + contract `grok-qa-v1.70-create-modify-print-traditional`

## Before → After
| Surface | v1.69 | v1.70 |
|---------|-------|-------|
| CREATE facesketch / othread / ithread | 面上草图／面加螺纹／内螺纹孔 | **面上草圖／面加螺紋／內螺紋孔** |
| MODIFY moveface / filletall / cylpatch / splitsketch | 移动面／全棱圆角／圆柱曲面贴花／草图轮廓分割 | **移動面／全棱圓角／圓柱曲面貼花／草圖輪廓分割** |
| LAB tube / rbox / dome / halfcyl | 圆管／圆角盒／圆顶／半圆柱 | **圓管／圓角盒／圓頂／半圓柱** |
| LAB xray / autoorient / wallcheck / projsurf | 透视／自动摆正／壁厚检查／投影到圆柱面 | **透視／自動擺正／壁厚檢查／投影到圓柱面** |
| Timeline / BrowserTree | 内螺纹孔／面外螺纹／移动面／曲面贴花 | **內螺紋孔／面外螺紋／移動面／曲面貼花** |
| SW CACHE | `webcad-v1.69` | **`webcad-v1.70`** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DDD5IoUN-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.70-20260919-131440` |
| Previous (kept) | `/var/www/webcad-releases/v1.69-20260919-130527` |
| nginx root | **sites-available + sites-enabled** → v1.70 release |
| current symlink | → `v1.70-20260919-131440` |
| entry md5 | `4c559a8531e365eb387f5da5cb727812` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.70-20260919-131440;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.70-20260919-131440;
```

## Verification
- Public entry `index-DDD5IoUN-r2.js` ✓ md5 match ✓
- Live SW `CACHE = 'webcad-v1.70'` ✓
- Live contains 面上草圖／面加螺紋／內螺紋孔／移動面／全棱圓角／圓柱曲面貼花／草圖輪廓分割／自動擺正／壁厚檢查／投影到圓柱面 ✓
- Live APP_VERSION **1.70** ✓
- Retained: 插入STL网格／導出STL／裝配工程圖／尺寸已拒絕／選擇／構造擴展／螺紋桿／3D列印／導入DXF／過三點平面 ✓
- Contracts v1.68–v1.70 static **PASS**

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once (or Clear site data), then hard refresh
2. Version badge **1.70**
3. CREATE: **面上草圖／面加螺紋／內螺紋孔**
4. MODIFY／LAB: **移動面／全棱圓角／圓柱曲面貼花／草圖輪廓分割／圓管／圓角盒／圓頂／半圓柱／透視／自動擺正／壁厚檢查／投影到圓柱面**
5. Regress: 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, Boolean help TC, LAB gear TC, 構造擴展／螺紋桿／用戶坐標系／過三點平面／導入DXF／3D列印, ZH chrome; LAB tools stay under 實驗室
