# DEPLOY-RESULT v1.53

**Date:** 2026-09-19 11:00 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/107 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** SOLID ASSEMBLE ribbon Traditional Chinese — 新建組件／組件布爾／關節／剛性組／驅動關節… (was Simplified)

## Ship contents
- SOLID ASSEMBLE ribbon labels → zh-Hant (新建組件／組件布爾／關節／按現狀關節／關節原點／剛性組／運動連接／啟用接觸集／新建接觸集／運動研究／驅動關節).
- Matching BrowserTree chrome + CommandPalette synonyms + ZH_GROUP `裝配`.
- EN_LABEL + STATUS_PHRASES_X Traditional keys (legacy SC keys retained for store/toast until a later pass).
- APP_VERSION **1.53** + contract `grok-qa-v1.53-assemble-traditional`.
- Keeps FORM TC (v1.49), SOLID CREATE TC (v1.50), illegal reject TC (v1.51), MODIFY TC (v1.52), plane buttons (v1.46), Box soft-lock (v1.45), MESH DnD (v1.41–1.44). Sketch `对称`→Symmetric intact.

## Before → After
| Surface | v1.52 (SC leftover) | v1.53 (TC/HK) |
|---------|---------------------|---------------|
| New Component / Comp Boolean | 新建组件／组件布尔 | **新建組件／組件布爾** |
| Joint / As-Built / Origin | 关节／按现状关节／关节原点 | **關節／按現狀關節／關節原點** |
| Rigid / Motion / Drive | 刚性组／运动连接／驱动关节 | **剛性組／運動連接／驅動關節** |
| Group title | 装配 | **裝配** |
| MODIFY / CREATE / illegal | 圓角／建立草圖／尺寸已拒絕 | unchanged |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-z-F8M-ZM-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.53-20260919-105831` |
| Previous (kept) | `/var/www/webcad-releases/v1.52-20260919-105328` |
| nginx root | **sites-available + sites-enabled** → v1.53 release |
| current symlink | → `v1.53-20260919-105831` |
| entry md5 | `625814e17ab68793eb9de056040aa474` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.53-20260919-105831;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.53-20260919-105831;
```
Both point at the **NEW** v1.53 release (not stuck on v1.52).

## Verification
- Public `index.html` references `index-z-F8M-ZM-r2.js` ✓
- Live JS contains `1.53` ✓
- Live entry md5 matches local (`625814e17ab68793eb9de056040aa474`) ✓
- Live entry contains `新建組件`, `組件布爾`, `關節`, `剛性組`, `驅動關節`, `圓角`, `抽殼`, `尺寸已拒絕`, `建立草圖`, `建立造型`, `長方體`, `完成造型` ✓
- Live entry does **not** contain `尺寸已拒绝` or `创建造型` ✓
- Live entry retains `form-create-plane-hint`, `placeFormBoxOnOriginPlane`, `acceptMeshDropFile` ✓
- Contracts: static ASSEMBLE/MODIFY/CREATE/illegal QA **PASS** (40/40)

## BOT-D verify steps
1. SOLID → ASSEMBLE strip shows **新建組件／組件布爾／關節／剛性組／驅動關節** (not Simplified).
2. Browser tree ⋯ menu **組件布爾**; sections **關節原點／剛性組**.
3. (Optional) MESH: drag STL — still PASS.
4. SOLID → length ≤0 → **尺寸已拒絕** (v1.51 intact).
5. SOLID → MODIFY still **圓角／抽殼**; CREATE **建立草圖／長方體**; FORM **建立造型／完成造型**.
