# DEPLOY-RESULT v1.55

**Date:** 2026-09-19 11:13 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/112 (MERGED → `feat/native-car-stage1-20260906`)  
**Also includes:** PR #111 INSPECT/ANALYZE Traditional (merged earlier same hour)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** BUG-BD-5401 — SURFACE「翻轉曲面」on MODIFY (quick) + INSPECT ribbon TC

## Ship contents
- SURFACE MODIFY: `reversesurf` → **翻轉曲面** with `quick: true` (was buried in CREATE-only).
- INSPECT/ANALYZE ribbon → zh-Hant (測量／干涉檢查／斑馬紋／質心／物理屬性…).
- APP_VERSION **1.55** + contract asserts MODIFY placement (not SC-only).
- Keeps FORM/CREATE/MODIFY/ASSEMBLE/illegal/MESH/Finish/plane/`对称`→Symmetric intact.
- SC synonyms retained for CommandPalette search (e.g. 翻转曲面 still present as search alias).

## Before → After
| Surface | v1.54 | v1.55 |
|---------|-------|-------|
| SURFACE 翻轉曲面 | Missing on MODIFY strip (BUG-BD-5401) | **MODIFY quick + dropdown** |
| INSPECT labels | SC leftover | **測量／干涉檢查／斑馬紋…** |
| FORM / SOLID / ASSEMBLE | TC (v1.49–1.53) | unchanged |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-Cpkd0wcs-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.55-20260919-111240` |
| Previous (kept) | `/var/www/webcad-releases/v1.54-20260919-110351` |
| nginx root | **sites-available + sites-enabled** → v1.55 release |
| current symlink | → `v1.55-20260919-111240` |
| entry md5 | `c1ad9a4332b5e7834a9e7140281b0d28` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.55-20260919-111240;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.55-20260919-111240;
```

## Live string smoke (entry JS)
- Need PASS: 1.55, 翻轉曲面, 曲面放樣, 測量, 干涉檢查, 斑馬紋, 質心, 物理屬性, 新建組件, 圓角, 抽殼, 尺寸已拒絕, 建立草圖, 建立造型, 長方體, 完成造型
- SC alias `翻转曲面` still in bundle for search (intentional)
