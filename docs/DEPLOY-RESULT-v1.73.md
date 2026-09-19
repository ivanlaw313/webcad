# DEPLOY-RESULT v1.73

**Date:** 2026-09-19 13:41 HKT  
**PRs:**  
- https://github.com/ivanlaw313/webcad/pull/154 — Timeline/BrowserTree FEAT labels TC (MERGED) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** Timeline + BrowserTree FEAT residual SC → HK Traditional + SW CACHE bump  
**Note:** Ribbon SURFACE/MODIFY already TC — this slice is tree/timeline FEAT maps.

## Ship contents
- Timeline/BrowserTree FEAT: **原語**／**邊界補面**／**縫合 Stitch**／**取消縫合**／**規則曲面**／**去裁/還原**／**編輯曲面控制點**／**複製實體**／**移動**／**翻轉曲面**／**加厚整張曲面**／**STEP實體**／**草圖**／**網格實體**／**拉伸組**／**縮放**／**替換面**／**合併面**／**參考面**／**陣列（組）**
- BrowserTree datum chrome: **參考面**／**編輯參考面**／**顯示 / 隱藏此參考面**
- i18n EN_LABEL + STATUS_PHRASES_X TC keys (legacy SC retained for tLabel/tStatus)
- `public/sw.js` **CACHE=`webcad-v1.73`** + RELEASE comment; navigate network-first unchanged
- APP_VERSION **1.73** + contract `grok-qa-v1.73-timeline-browsertree-feat-traditional`
- Soft-update: v1.72 SW assert → 1.72+

## Before → After
| Surface | v1.72 | v1.73 |
|---------|-------|-------|
| Timeline/BrowserTree prim | 原语 | **原語** |
| Timeline/BrowserTree boundarypatch | 边界补面 | **邊界補面** |
| Timeline/BrowserTree editpoles | 编辑曲面控制点 | **編輯曲面控制點** |
| Timeline/BrowserTree copybody | 复制实体 | **複製實體** |
| Timeline/BrowserTree transform | 移动 | **移動** |
| Timeline/BrowserTree reversesurf | 翻转曲面 | **翻轉曲面** |
| Timeline/BrowserTree meshbody | 网格实体 | **網格實體** |
| Timeline/BrowserTree stepbody | STEP实体 | **STEP實體** |
| Timeline datum / BrowserTree chrome | 参考面 | **參考面** |
| Timeline scale/replaceface/mergefaces | 缩放／替换面／合并面 | **縮放**／**替換面**／**合併面** |
| SW CACHE | `webcad-v1.72` | **`webcad-v1.73`** |

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `584095197107c0a17154933f10751a3ace603908` |
| Commit | `f28f4c50c27d7bac2b7d661f9c03a395c61543f8` |
| Local entry | `index-CBib4F7S-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.73-20260919-134016` |
| Previous (kept) | `/var/www/webcad-releases/v1.72-20260919-133307` |
| nginx root | **sites-available + sites-enabled** → v1.73 release |
| current symlink | → `v1.73-20260919-134016` |
| entry md5 | `3a1282790d93db0fad3c25295321fe46` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.73-20260919-134016;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.73-20260919-134016;
```

## Verification
- Public entry `index-CBib4F7S-r2.js` ✓ md5 match ✓
- Live SW `CACHE = 'webcad-v1.73'` ✓
- Live contains 原語／複製實體／網格實體／編輯曲面控制點／翻轉曲面／參考面／CREATE 擴充／製造 CAM／受力雲圖／`1.73`／插入STL网格／實驗室 ✓
- Retained: 插入STL网格／導出STL／裝配工程圖／尺寸已拒絕／選擇／爆炸視圖／3D列印／Boolean leftovers／LAB under 實驗室 ✓
- Contract tests: 24 pass (v1.70–v1.73 + soft-updated v1.72)

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once (or Clear site data), then hard refresh
2. Version badge **1.73**
3. Timeline / BrowserTree feature chips: **原語**／**編輯曲面控制點**／**複製實體**／**移動**／**翻轉曲面**／**網格實體**／**參考面**／…
4. BrowserTree datum row: **參考面**
5. Regress: 插入STL网格, CREATE 擴充／製造 CAM／堆疊／受力雲圖／切層預覽, LAB under 實驗室, ZH chrome
