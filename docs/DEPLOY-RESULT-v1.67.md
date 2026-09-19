# DEPLOY-RESULT v1.67

**Date:** 2026-09-19 12:51 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/139 — MERGED → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** 組件布爾／實體布爾 help+status tips → HK Traditional + SW CACHE bump

## Root cause
1. Solid @1.65 noted Boolean **help/description** still SC: 外扩／留间隙／来源／网格／结果／时间轴／按钮 (main toasts already TC).
2. Solid GATE FAIL @1.66: bot still saw badge **1.65** after hard refresh — VPS was confirmed 1.66; `public/sw.js` used constant `CACHE='webcad-v1'` never bumped, so activate never deleted old caches.

## Ship contents
- `featureStatus` boolean/newBody builders → **已實體布爾／已合併／時間軸可改/可刪／保留工具體／已開新實體**
- Viewport combine dlg help → **結果／目標／工具體／泊車／沒有工具體／保留工具體（Keep Tools）／＋合併**
- Viewport 組件布爾 + edit titles → **組件布爾／網格布爾／留間隙／時間軸／來源**
- store prompts → **外擴／間隙／組件布爾／一步式布爾／裝配/網格件** status tip TC
- i18n TC identity keys (legacy SC retained)
- `public/sw.js` **CACHE=`webcad-v1.67`** + RELEASE comment; navigate network-first unchanged
- APP_VERSION **1.67** + contract `grok-qa-v1.67-boolean-help-traditional-sw-cache`

## Before → After
| Surface | v1.66 | v1.67 |
|---------|-------|-------|
| booleanSuccessStatus | 已实体布尔…时间轴可改/可删 | **已實體布爾…時間軸可改/可刪** |
| combine dlg help | 结果/工具体/泊车 (SC) | **結果／工具體／泊車** |
| 組件布爾 title | 网格/留间隙 (SC) | **網格／留間隙** |
| store clearance tip | XY 外扩 | **XY 外擴** |
| SW CACHE | `webcad-v1` (never bumped) | **`webcad-v1.67`** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-BExkpR2g-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.67-20260919-124925` |
| Previous (kept) | `/var/www/webcad-releases/v1.66-20260919-123736` |
| nginx root | **sites-available + sites-enabled** → v1.67 release |
| current symlink | → `v1.67-20260919-124925` |
| entry md5 | `a62b4e26c85719b322b0aa33f3cd40e6` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.67-20260919-124925;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.67-20260919-124925;
```

## Verification
- Public entry `index-BExkpR2g-r2.js` ✓ md5 match ✓
- Live SW `CACHE = 'webcad-v1.67'` ✓
- Live contains 已實體布爾／外擴／組件布爾：此件 ✓
- Contracts v1.38–v1.67 static **PASS** (181)

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once (or Clear site data), then hard refresh
2. Version badge **1.67**
3. 實體布爾 / 合併 dialog: help shows **結果／工具體／泊車／保留工具體**
4. 組件布爾 title: **網格布爾／留間隙**; edit title: **時間軸／來源**
5. Regress: 插入STL网格, 導出STL／導出全部零件, 裝配工程圖, 尺寸已拒絕, 選擇, Shell/bake TC, LAB gear TC, ZH chrome; LAB tools stay under 實驗室
