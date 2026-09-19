# DEPLOY-RESULT v1.70

**Date:** 2026-09-19 13:17 HKT  
**PRs:**  
- https://github.com/ivanlaw313/webcad/pull/145 — CREATE/MODIFY/PRINT residual TC (MERGED)  
- https://github.com/ivanlaw313/webcad/pull/146 — INSERT canvas/decal + Boolean leftovers TC (MERGED) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** INSERT 畫布／貼花／組件／緊固件／3MF／OBJ + Solid@1.68 Boolean 來源／工具體／網格布爾 (+ PR#145 LAB CREATE/MODIFY/PRINT) → HK Traditional + SW CACHE bump

## Ship contents
- INSERT: **插入組件／插入緊固件／插入3MF網格／插入OBJ網格／畫布／貼花** (pin **插入STL网格** kept)
- FastenerDialog **插入緊固件**; Viewport **🏷貼花**; FD／tree／timeline **曲面貼花**
- Boolean: CompBool pick **來源「…」**; store **來源體／工具體／來源位置與關節保留**; bake tip **組件布爾＝網格布爾**
- PR#145 LAB: 面上草圖／面加螺紋／內螺紋孔／圓管／圓頂／半圓柱／移動面… (stays under 🧪實驗室)
- `public/sw.js` **CACHE=`webcad-v1.70`** + RELEASE comment; navigate network-first unchanged
- APP_VERSION **1.70** + contracts `grok-qa-v1.70-create-modify-print-traditional` + `grok-qa-v1.70-insert-canvas-decal-traditional`

## Before → After
| Surface | v1.69 | v1.70 |
|---------|-------|-------|
| INSERT canvas/decal | 画布／贴花 | **畫布／貼花** |
| INSERT component/fastener/3MF/OBJ | 插入组件／紧固件／*网格 | **插入組件／緊固件／*網格** |
| CompBool pick | 来源「…」 | **來源「…」** |
| CompBool Body prompts | 工具 Body／来源 Body | **工具體／來源體** |
| Bake guidance | 組件布爾＝網格結果 | **組件布爾＝網格布爾** |
| SW CACHE | `webcad-v1.69` | **`webcad-v1.70`** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DDD5IoUN-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.70-20260919-131624` |
| Previous (kept) | `/var/www/webcad-releases/v1.69-20260919-130527` |
| nginx root | **sites-available + sites-enabled** → v1.70 release |
| current symlink | → `v1.70-20260919-131624` |
| entry md5 | `4c559a8531e365eb387f5da5cb727812` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.70-20260919-131624;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.70-20260919-131624;
```

## Verification
- Public entry `index-DDD5IoUN-r2.js` ✓ md5 match ✓
- Live SW `CACHE = 'webcad-v1.70'` ✓
- Live contains 畫布／貼花／插入組件／來源體／網格布爾（非零件／插入STL网格／`1.70` ✓
- Retained: 插入STL网格／導出STL／裝配工程圖／尺寸已拒絕／選擇／爆炸視圖／3D列印／螺紋桿／中間平面 ✓

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once (or Clear site data), then hard refresh
2. Version badge **1.70**
3. INSERT: **畫布／貼花／插入組件／插入緊固件／插入3MF網格／插入OBJ網格** (STL pin still 插入STL网格)
4. 組件布爾 success tip: **來源／工具體／網格布爾**
5. Regress: 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, Boolean help core, LAB gear TC, construct plane/axis/point, ZH chrome; LAB tools stay under 實驗室
