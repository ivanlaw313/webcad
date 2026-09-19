# DEPLOY-RESULT v1.55

**Date:** 2026-09-19 11:14 HKT  
**PRs:** https://github.com/ivanlaw313/webcad/pull/111 (INSPECT TC) · https://github.com/ivanlaw313/webcad/pull/112 (BUG-BD-5401 MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** **BUG-BD-5401** SURFACE「翻轉曲面」on MODIFY (quick) + INSPECT/ANALYZE Traditional Chinese

## Ship contents
- **BUG-BD-5401:** `reversesurf` moved CREATE → SURFACE **MODIFY** with `quick: true` so **翻轉曲面** appears on ribbon strip + Modify dropdown.
- INSPECT/ANALYZE ribbon → zh-Hant (測量／干涉檢查／斑馬紋分析／質心／物理屬性／顯示網格面組／檢查擴展／兩點距離…).
- APP_VERSION **1.55** + contract `grok-qa-v1.55-inspect-traditional` (asserts BD-5401 + INSPECT TC).
- Keeps FORM TC, SOLID CREATE TC, illegal reject TC, MODIFY TC, ASSEMBLE TC, SURFACE TC (v1.54), plane buttons, Box soft-lock, MESH DnD/toast SC pins. Sketch `对称`→Symmetric intact.

## Before → After
| Surface | v1.54 | v1.55 |
|---------|-------|-------|
| SURFACE MODIFY | 加厚/按拉／分割／合併 only (翻轉曲面 buried in CREATE ▾) | **翻轉曲面** quick + dropdown (**BUG-BD-5401**) |
| INSPECT | 测量／干涉检查／斑马纹／质心／物理属性 | **測量／干涉檢查／斑馬紋／質心／物理屬性** |
| ASSEMBLE / MODIFY / FORM / SURFACE CREATE | TC | unchanged |

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
Both point at the **NEW** v1.55 release (not stuck on v1.54).

## Verification
- Public `index.html` references `index-Cpkd0wcs-r2.js` ✓
- Live JS contains `1.55` ✓
- Live entry md5 matches local (`c1ad9a4332b5e7834a9e7140281b0d28`) ✓
- Live entry contains `翻轉曲面`, `測量`, `干涉檢查`, `斑馬紋分析`, `質心`, `物理屬性`, `曲面放樣`, `新建組件`, `組件布爾`, `關節`, `圓角`, `抽殼`, `尺寸已拒絕`, `建立草圖`, `建立造型`, `完成造型`, `長方體`, `插入STL网格` ✓
- Live entry does **not** contain `尺寸已拒绝` or `创建造型` ✓
- Contracts: static BD-5401 + INSPECT/SURFACE QA **PASS**

## BOT-D verify steps
1. SURFACE → MODIFY shows **翻轉曲面** (quick icon + dropdown) — closes BUG-BD-5401.
2. SOLID → INSPECT shows **測量／干涉檢查／斑馬紋／質心／物理屬性** (not Simplified).
3. SURFACE CREATE still **曲面放樣／規則曲面／補面／縫合**; ASSEMBLE **新建組件**; MODIFY **圓角／抽殼**; FORM **建立造型／完成造型**.
4. (Optional) MESH insert still 插入STL网格 (SC pin).
