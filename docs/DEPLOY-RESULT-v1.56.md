# DEPLOY-RESULT v1.56

**Date:** 2026-09-19 11:18 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/115 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** **DRAWING** ribbon Simplified→Traditional (`工程图`→**工程圖**)

## Ship contents
- MANAGE DRAWING tool label **工程圖** (was 工程图).
- ZH_GROUP `DRAWING: 工程圖`; EN_LABEL `'工程圖': 'Drawing'` (legacy SC key retained).
- File menu **工程圖（三视图）** / **裝配工程圖 + BOM**; IntroCard onboarding「工程圖」.
- APP_VERSION **1.56** + contract `grok-qa-v1.56-drawing-traditional`.
- Keeps FORM/CREATE/MODIFY/ASSEMBLE/SURFACE/INSPECT TC, illegal reject TC, MESH DnD/toast SC pins, plane buttons, Finish soft-lock, sketch `对称`→Symmetric. SKETCH residual SC deferred.

## Before → After
| Surface | v1.55 | v1.56 |
|---------|-------|-------|
| MANAGE DRAWING | 工程图 | **工程圖** |
| File → Drawing | 工程图（三视图）／装配工程图 + BOM | **工程圖（三视图）／裝配工程圖 + BOM** |
| INSPECT / SURFACE / ASSEMBLE / MODIFY / FORM | TC | unchanged |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-CHAtlRUA-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.56-20260919-111751` |
| Previous (kept) | `/var/www/webcad-releases/v1.55-20260919-111240` |
| nginx root | **sites-available + sites-enabled** → v1.56 release |
| current symlink | → `v1.56-20260919-111751` |
| entry md5 | `c2927b330358045f8a048367284e23f8` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.56-20260919-111751;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.56-20260919-111751;
```
Both point at the **NEW** v1.56 release (not stuck on v1.55).

## Verification
- Public `index.html` references `index-CHAtlRUA-r2.js` ✓
- Live JS contains `1.56` ✓
- Live entry md5 matches local (`c2927b330358045f8a048367284e23f8`) ✓
- Live entry contains `工程圖`, `翻轉曲面`, `測量`, `干涉檢查`, `斑馬紋分析`, `質心`, `物理屬性`, `曲面放樣`, `新建組件`, `組件布爾`, `關節`, `圓角`, `抽殼`, `尺寸已拒絕`, `建立草圖`, `建立造型`, `長方體`, `完成造型`, `插入STL网格` ✓
- Live entry does **not** contain `尺寸已拒绝` or `创建造型` ✓
- Contracts: static DRAWING + prior TC QA **PASS** (17/17 with v1.54/v1.55)

## BOT-D verify steps
1. MANAGE → DRAWING shows **工程圖** (not 工程图).
2. File menu shows **工程圖（三视图）** and **裝配工程圖 + BOM**.
3. SURFACE MODIFY still **翻轉曲面**; INSPECT **測量／干涉檢查**; ASSEMBLE **新建組件**; FORM **建立造型／完成造型**.
4. (Optional) MESH insert still 插入STL网格 (SC pin). SKETCH residual SC deferred to later pass.
