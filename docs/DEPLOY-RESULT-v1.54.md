# DEPLOY-RESULT v1.54

**Date:** 2026-09-19 11:04 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/109 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** SURFACE ribbon Traditional Chinese — 曲面放樣／規則曲面／補面／縫合／翻轉曲面／編輯曲面控制點… (was Simplified)

## Ship contents
- SURFACE CREATE/MODIFY/SELECT ribbon labels → zh-Hant (曲面放樣／規則曲面／曲面掃掠／曲面旋轉／補面／橋接面／邊界補面／加厚整張曲面／翻轉曲面／旋轉面／縫合／取消縫合／去裁/還原／相交曲線／Form 圓柱／Form 環面／編輯曲面控制點／旋轉／掃掠／放樣／選擇).
- Matching EN_LABEL Traditional keys + CommandPalette TC synonyms (SC retained for search).
- APP_VERSION **1.54** + contract `grok-qa-v1.54-surface-traditional`.
- Keeps FORM TC (v1.49), SOLID CREATE TC (v1.50), illegal reject TC (v1.51), MODIFY TC (v1.52), ASSEMBLE TC (v1.53), plane buttons (v1.46), Box soft-lock (v1.45), MESH DnD/toast SC pins (v1.41–1.44). Sketch `对称`→Symmetric intact.

## Before → After
| Surface | v1.53 (SC leftover) | v1.54 (TC/HK) |
|---------|---------------------|---------------|
| Surface loft / ruled | 曲面放样／规则曲面 | **曲面放樣／規則曲面** |
| Sweep / revolve | 曲面扫掠／曲面旋转 | **曲面掃掠／曲面旋轉** |
| Patch / bridge / boundary | 补面／桥接面／边界补面 | **補面／橋接面／邊界補面** |
| Stitch / reverse / edit poles | 缝合／翻转／编辑控制点 | **縫合／翻轉／編輯控制點** |
| ASSEMBLE / MODIFY / FORM | 新建組件／圓角／建立造型 | unchanged |
| MESH insert / DnD toast | 插入STL网格／松开以导入网格 | unchanged (contracts pin SC) |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-Va6JmNE6-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.54-20260919-110351` |
| Previous (kept) | `/var/www/webcad-releases/v1.53-20260919-105831` |
| nginx root | **sites-available + sites-enabled** → v1.54 release |
| current symlink | → `v1.54-20260919-110351` |
| entry md5 | `f1db0fbaf85fe1f7802576c22b63171e` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.54-20260919-110351;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.54-20260919-110351;
```
Both point at the **NEW** v1.54 release (not stuck on v1.53).

## Verification
- Public `index.html` references `index-Va6JmNE6-r2.js` ✓
- Live JS contains `1.54` ✓
- Live entry md5 matches local (`f1db0fbaf85fe1f7802576c22b63171e`) ✓
- Live entry contains `曲面放樣`, `規則曲面`, `補面 Patch`, `縫合 Stitch`, `翻轉曲面`, `編輯曲面控制點`, `新建組件`, `組件布爾`, `關節`, `圓角`, `抽殼`, `尺寸已拒絕`, `建立草圖`, `建立造型`, `長方體`, `完成造型`, `插入STL网格` ✓
- Live entry does **not** contain `尺寸已拒绝` or `创建造型` ✓
- Live entry retains `form-create-plane-hint`, `placeFormBoxOnOriginPlane`, `acceptMeshDropFile` (via prior contracts; MESH insert SC string retained) ✓
- Contracts: static SURFACE/ASSEMBLE/MODIFY/CREATE/illegal/MESH QA **PASS** (42/42)

## BOT-D verify steps
1. SURFACE tab shows **曲面放樣／規則曲面／補面／縫合／翻轉曲面／編輯曲面控制點** (not Simplified).
2. SOLID → ASSEMBLE still **新建組件／組件布爾／關節**; MODIFY **圓角／抽殼**; CREATE **建立草圖／長方體**; FORM **建立造型／完成造型**.
3. (Optional) MESH: drag STL — still PASS; insert label still 插入STL网格 (SC pin).
4. SOLID → length ≤0 → **尺寸已拒絕** (v1.51 intact).
