# DEPLOY-RESULT v1.57

**Date:** 2026-09-19 11:25 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/117 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** **SKETCH** contextual ribbon Simplified→Traditional (直線／圓／鏡像／陣列／選擇／完成草圖…)

## Ship contents
- SKETCH_PANELS tool labels TC (CREATE/MODIFY/CONSTRAINTS): 直線／圓／圓弧／樣條／多邊形／橢圓／鏡像／陣列／選擇／豎直／共線／對稱／自動約束／撤約束／截面屬性…
- Finish Sketch chrome: Ribbon tab **草圖**, pin/tab **完成草圖**, Viewport button **完成草圖**
- ZH_GROUP `CONSTRAINTS: 約束`; EN_LABEL TC keys; legacy `'对称': 'Symmetric'` retained
- IntroCard onboarding 建立草圖／完成草圖
- APP_VERSION **1.57** + contract `grok-qa-v1.57-sketch-traditional`
- Keeps FORM/CREATE/MODIFY/ASSEMBLE/SURFACE/INSPECT/DRAWING TC, illegal reject TC, MESH DnD/toast SC pins, plane buttons, Finish Form soft-lock. SOLID CREATE residual SC (旋转／镜像／阵列) deferred.

## Before → After
| Surface | v1.56 | v1.57 |
|---------|-------|-------|
| SKETCH Line / Circle / Mirror / Pattern / Select | 直线／圆／镜像／阵列／选择 | **直線／圓／鏡像／陣列／選擇** |
| Finish Sketch chrome | 完成草图／草图 | **完成草圖／草圖** |
| DRAWING / INSPECT / SURFACE / ASSEMBLE / MODIFY / FORM | TC | unchanged |
| MESH insert toast | 插入STL网格 (SC pin) | unchanged |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DxVJ5Npt-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.57-20260919-112338` |
| Previous (kept) | `/var/www/webcad-releases/v1.56-20260919-111751` |
| nginx root | **sites-available + sites-enabled** → v1.57 release |
| current symlink | → `v1.57-20260919-112338` |
| entry md5 | `98a99877f28e45802cb596867b026b7e` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.57-20260919-112338;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.57-20260919-112338;
```
Both point at the **NEW** v1.57 release (not stuck on v1.56).

## Verification
- Public `index.html` references `index-DxVJ5Npt-r2.js` ✓
- Live JS contains `1.57` ✓
- Live entry md5 matches local (`98a99877f28e45802cb596867b026b7e`) ✓
- Live entry contains `完成草圖`, `直線`, `陣列`, `對稱`, `工程圖`, `翻轉曲面`, `測量`, `干涉檢查`, `尺寸已拒絕`, `建立草圖`, `建立造型`, `插入STL网格` ✓
- Live entry does **not** contain `尺寸已拒绝` or `创建造型` ✓
- Contracts: static SKETCH + prior TC QA **PASS**

## BOT-D verify steps
1. Enter sketch → contextual tab shows **草圖**; tools show **直線／圓／鏡像／陣列／選擇** (not SC).
2. Finish control shows **完成草圖** (Ribbon pin + Viewport).
3. SURFACE MODIFY still **翻轉曲面**; DRAWING **工程圖**; INSPECT **測量／干涉檢查**; FORM **建立造型／完成造型**.
4. (Optional) MESH insert still 插入STL网格 (SC pin). SOLID CREATE residual 旋转／镜像／阵列 deferred.
