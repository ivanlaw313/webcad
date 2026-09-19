# DEPLOY-RESULT v1.69

**Date:** 2026-09-19 13:07 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/143 — MERGED → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** Construct plane/axis/point residual ribbon/dialog/tree labels → HK Traditional + SW CACHE bump

## Ship contents
- ribbon SOLID CONSTRUCT: **中間平面／過兩邊平面／過三點平面／沿路徑平面／垂直面軸／過兩平面軸／過兩點軸／沿邊軸／兩邊交點／三平面交點／圓／球／環面中心點／邊與平面交點／沿路徑點**
- LAB panel **構造擴展**: **過點平行面／方向構造軸／坐標構造點／兩點中點／構造點陣列** (stays under 🧪實驗室)
- BrowserTree section **構造** + row **構造軸／構造點**; Viewport FD **參考平面／構造點／構造軸**
- store datum method dialog labels TC; i18n EN_LABEL + STATUS_PHRASES_X (legacy SC retained)
- `public/sw.js` **CACHE=`webcad-v1.69`** + RELEASE comment; navigate network-first unchanged
- APP_VERSION **1.69** + contract `grok-qa-v1.69-construct-plane-axis-point-traditional`

## Before → After
| Surface | v1.68 | v1.69 |
|---------|-------|-------|
| Midplane / 2-edge / 3-pt / path plane | 中间平面／过两边平面／过三点平面／沿路径平面 | **中間平面／過兩邊平面／過三點平面／沿路徑平面** |
| Perp-face / 2-plane / 2-pt / edge axis | 垂直面轴／过两平面轴／过两点轴／沿边轴 | **垂直面軸／過兩平面軸／過兩點軸／沿邊軸** |
| 2-edge / 3-plane / center / edge×plane / path point | 两边交点／三平面交点／圆／球／环面中心点／边与平面交点／沿路径点 | **兩邊交點／三平面交點／圓／球／環面中心點／邊與平面交點／沿路徑點** |
| LAB panel + extensions | 构造扩展 + SC tools | **構造擴展** + TC tools |
| FD / tree | 参考平面／构造点／构造轴／构造 | **參考平面／構造點／構造軸／構造** |
| SW CACHE | `webcad-v1.68` | **`webcad-v1.69`** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-B9RdGZYn-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.69-20260919-130527` |
| Previous (kept) | `/var/www/webcad-releases/v1.68-20260919-125457` |
| nginx root | **sites-available + sites-enabled** → v1.69 release |
| current symlink | → `v1.69-20260919-130527` |
| entry md5 | `383d2baa72f352d97b067bc722d0ba44` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.69-20260919-130527;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.69-20260919-130527;
```

## Verification
- Public entry `index-B9RdGZYn-r2.js` ✓ md5 match ✓
- Live SW `CACHE = 'webcad-v1.69'` ✓
- Live contains 中間平面／過兩邊平面／垂直面軸／兩邊交點／圓／球／環面中心點／構造擴展／參考平面／構造點／構造軸 ✓
- Retained: 插入STL网格／導出STL／裝配工程圖／尺寸已拒絕／選擇／爆炸視圖／3D列印／螺紋桿 ✓
- Contracts v1.64–v1.69 static **PASS** (40)

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once (or Clear site data), then hard refresh
2. Version badge **1.69**
3. CONSTRUCT: **中間平面／過兩邊平面／過三點平面／沿路徑平面／垂直面軸／過兩平面軸／過兩點軸／沿邊軸／兩邊交點／三平面交點／圓／球／環面中心點／邊與平面交點／沿路徑點**
4. 實驗室 → **構造擴展**: **過點平行面／方向構造軸／坐標構造點／兩點中點／構造點陣列**
5. Regress: 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, Boolean help TC, LAB gear TC, v1.68 labels, ZH chrome; LAB tools stay under 實驗室
