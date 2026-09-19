# DEPLOY-RESULT v1.59

**Date:** 2026-09-19 11:41 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/121 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** **SOLID CREATE residual** Simplified→Traditional (旋轉／掃掠／放樣／鏡像／陣列 + 子選單)

## Ship contents
- SOLID CREATE ribbon: **旋轉／掃掠／放樣／鏡像／陣列**
- Pattern children: **矩形陣列／環形陣列／幾何陣列／路徑陣列**; **掃掠(拾邊)**
- FD_TITLE + Timeline + BrowserTree feature labels TC; EN_LABEL TC keys (legacy SC keys kept)
- APP_VERSION **1.59** + contract `grok-qa-v1.59-solid-create-residual-traditional`
- Keeps SKETCH TC, DRAWING modal TC, FORM/MODIFY/ASSEMBLE/SURFACE/INSPECT TC, illegal reject TC, MESH DnD/toast SC pins, 翻轉曲面

## Before → After
| Surface | v1.58 | v1.59 |
|---------|-------|-------|
| SOLID CREATE revolve/sweep/loft | 旋转／扫掠／放样 | **旋轉／掃掠／放樣** |
| SOLID CREATE mirror/pattern | 镜像／阵列 | **鏡像／陣列** |
| Pattern submenu | 矩形／环形／几何／路径阵列 | **矩形／環形／幾何／路徑陣列** |
| SKETCH / DRAWING modal / 翻轉曲面 / MESH toast | TC / TC / TC / SC pin | unchanged |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DFAhaD5w-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.59-20260919-113814` |
| Previous (kept) | `/var/www/webcad-releases/v1.58-20260919-113036` |
| nginx root | **sites-available + sites-enabled** → v1.59 release |
| current symlink | → `v1.59-20260919-113814` |
| entry md5 | `bdc165b179bb2e494ad60f902b5227a5` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.59-20260919-113814;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.59-20260919-113814;
```
Both point at the **NEW** v1.59 release (not stuck on v1.58).

## Verification
- Public `index.html` references `index-DFAhaD5w-r2.js` ✓
- Live JS contains `1.59` ✓
- Live entry md5 matches local (`bdc165b179bb2e494ad60f902b5227a5`) ✓
- Live contains `旋轉`, `掃掠`, `放樣`, `鏡像`, `陣列`, `矩形陣列`, `環形陣列`, `幾何陣列`, `路徑陣列` ✓
- Live contains `建立草圖`, `直線`, `工程圖`, `翻轉曲面`, `尺寸已拒絕`, `建立造型`, `插入STL网格` ✓
- No SC ribbon `label:'旋转'|扫掠|镜像|阵列` forms ✓ (legacy EN_LABEL SC keys intentionally retained)
- Contracts: static v1.50 + v1.57 + v1.58 + v1.59 **PASS**

## BOT-D verify steps
1. SOLID → CREATE → quick icons show **旋轉／掃掠／鏡像／陣列** (not 旋转／扫掠／镜像／阵列).
2. Pattern ▾ submenu: **矩形陣列／環形陣列／幾何陣列／路徑陣列**.
3. Open feature dialog → FD_TITLE **旋轉／矩形陣列／鏡像**.
4. Regress: SKETCH **直線／完成草圖**; DRAWING modal **前視圖**; SURFACE **翻轉曲面**; illegal **尺寸已拒絕**; MESH toast still **插入STL网格** (SC pin).
