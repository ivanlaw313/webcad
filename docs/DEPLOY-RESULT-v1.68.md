# DEPLOY-RESULT v1.68

**Date:** 2026-09-19 12:55 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/141 — MERGED → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** Construct residual + CREATE thread + INSERT DXF/SVG + LAB cone/explode/scale/3D列印 labels → HK Traditional + SW CACHE bump

## Ship contents
- ribbon labels: **螺紋桿／用戶坐標系／圓柱／圓錐／環面軸／頂點構造點／導入DXF／導入SVG／圓錐／爆炸視圖／整體縮放**
- LAB panel name **3D列印** (tools remain under 🧪實驗室)
- Timeline / BrowserTree thread; Viewport FD_TITLE cone/thread + explode dlg title
- i18n EN_LABEL + STATUS_PHRASES_X; CommandPalette TC aliases; legacy SC retained
- `public/sw.js` **CACHE=`webcad-v1.68`** + RELEASE comment; navigate network-first unchanged
- APP_VERSION **1.68** + contract `grok-qa-v1.68-construct-import-view-traditional`

## Before → After
| Surface | v1.67 | v1.68 |
|---------|-------|-------|
| CREATE thread | 螺纹杆 | **螺紋桿** |
| CONSTRUCT ucs / axiscyl / pointvertex | 用户坐标系／圆柱／圆锥／环面轴／顶点构造点 | **用戶坐標系／圓柱／圓錐／環面軸／頂點構造點** |
| INSERT DXF/SVG | 导入DXF／导入SVG | **導入DXF／導入SVG** |
| LAB 更多基元 cone | 圆锥 | **圓錐** |
| LAB 装配辅助 | 爆炸视图／整体缩放 | **爆炸視圖／整體縮放** |
| LAB panel | 3D打印 | **3D列印** |
| SW CACHE | `webcad-v1.67` | **`webcad-v1.68`** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-9fwxXcgS-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.68-20260919-125457` |
| Previous (kept) | `/var/www/webcad-releases/v1.67-20260919-124925` |
| nginx root | **sites-available + sites-enabled** → v1.68 release |
| current symlink | → `v1.68-20260919-125457` |
| entry md5 | `ce48898aa2b7c4c342416da14c64c26f` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.68-20260919-125457;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.68-20260919-125457;
```

## Verification
- Public entry `index-9fwxXcgS-r2.js` ✓ md5 match ✓
- Live SW `CACHE = 'webcad-v1.68'` ✓
- Live contains 螺紋桿／用戶坐標系／頂點構造點／導入DXF／爆炸視圖／整體縮放／3D列印／圓錐/圓台 ✓
- Retained: 插入STL网格／導出STL／已實體布爾 ✓
- Contracts v1.64–v1.68 static **PASS** (32)

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once (or Clear site data), then hard refresh
2. Version badge **1.68**
3. CREATE: **螺紋桿**; CONSTRUCT: **用戶坐標系／圓柱／圓錐／環面軸／頂點構造點**
4. INSERT: **導入DXF／導入SVG**; 實驗室 → **3D列印** panel; **圓錐／爆炸視圖／整體縮放**
5. Regress: 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, Boolean help TC, LAB gear TC, ZH chrome; LAB tools stay under 實驗室
