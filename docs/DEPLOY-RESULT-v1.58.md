# DEPLOY-RESULT v1.58

**Date:** 2026-09-19 11:32 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/119 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** **DRAWING modal** Simplified→Traditional (BUG-BD-5601: 裝配工程圖／三視圖／前視圖／俯視圖／右視圖)

## Ship contents
- DrawingPanel LABEL: **前視圖／俯視圖／右視圖／立體圖 (參考)／剖視圖 A—A**
- Modal head: **裝配工程圖 — 三視圖 + 氣泡 BOM** / **工程圖 — 三視圖 + 立體圖**
- File menu **工程圖（三視圖）**; IntroCard 三視圖; related export tips/basename TC
- APP_VERSION **1.58** + contract `grok-qa-v1.58-drawing-modal-traditional`
- Keeps SKETCH TC (v1.57), DRAWING ribbon 工程圖, FORM/CREATE/MODIFY/ASSEMBLE/SURFACE/INSPECT TC, illegal reject TC, MESH DnD/toast SC pins, 翻轉曲面

## Before → After
| Surface | v1.57 | v1.58 |
|---------|-------|-------|
| DRAWING modal head | 装配工程图 — 三视图…／工程图 — 三视图 + 立体图 | **裝配工程圖 — 三視圖…／工程圖 — 三視圖 + 立體圖** |
| View titles | 前视图／俯视图／右视图 | **前視圖／俯視圖／右視圖** |
| File → Drawing | 工程圖（三视图） | **工程圖（三視圖）** |
| SKETCH / 翻轉曲面 / MESH toast | TC / TC / SC pin | unchanged |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-CgpeKN2u-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.58-20260919-113036` |
| Previous (kept) | `/var/www/webcad-releases/v1.57-20260919-112338` |
| nginx root | **sites-available + sites-enabled** → v1.58 release |
| current symlink | → `v1.58-20260919-113036` |
| entry md5 | `de56278061a8779aa465bd40f1dddc86` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.58-20260919-113036;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.58-20260919-113036;
```
Both point at the **NEW** v1.58 release (not stuck on v1.57).

## Verification
- Public `index.html` references `index-CgpeKN2u-r2.js` ✓
- Live JS contains `1.58` ✓
- Live entry md5 matches local (`de56278061a8779aa465bd40f1dddc86`) ✓
- Live DrawingPanel contains `前視圖`, `俯視圖`, `右視圖`, `裝配工程圖 — 三視圖`, `工程圖 — 三視圖` ✓
- Live entry contains `完成草圖`, `直線`, `工程圖`, `翻轉曲面`, `測量`, `干涉檢查`, `尺寸已拒絕`, `建立草圖`, `建立造型`, `插入STL网格` ✓
- Live does **not** contain `装配工程图 — 三视图`, `尺寸已拒绝`, `创建造型` ✓
- Contracts: static v1.56 + v1.57 + v1.58 **PASS** (15/15)

## BOT-D verify steps (BUG-BD-5601)
1. MANAGE → **工程圖** (ribbon TC unchanged).
2. Open drawing modal → head shows **工程圖 — 三視圖 + 立體圖** (not 工程图／三视图／立体图).
3. View titles show **前視圖／俯視圖／右視圖** (not 前视图／俯视图／右视图).
4. File menu **工程圖（三視圖）**; assembly path **裝配工程圖 — 三視圖 + 氣泡 BOM**.
5. Regress: SKETCH **直線／完成草圖**; SURFACE **翻轉曲面**; illegal **尺寸已拒絕**; MESH toast still **插入STL网格** (SC pin).
