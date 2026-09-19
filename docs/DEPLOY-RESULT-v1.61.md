# DEPLOY-RESULT v1.61

**Date:** 2026-09-19 11:53 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/125 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** **ZH_GROUP / ZH_TAB chrome Traditional Chinese** (deferred from V160)

## Root cause
Ribbon group titles (`tGroup`) and workspace tabs (`tTab`) still used Simplified glyphs while tool labels (v1.48–v1.60) moved to TC — visible chrome mismatch on every workspace.

## Ship contents
- ZH_GROUP: 创建→**建立**, 构造→**構造**, 选择→**選擇**, 导出→**導出**, 参数→**參數**, 制造→**製造**
- ZH_TAB: 实体→**實體**, 网格→**網格**, 钣金→**鈑金**
- Already-TC retained: 約束／檢查／裝配／工程圖／對稱／修改／完成／插入／配置／造型／曲面／管理／工具／塑料
- APP_VERSION **1.61** + contract `grok-qa-v1.61-zh-group-tab-traditional`
- Keeps DRAWING/SKETCH/illegal/SOLID residual/裝配工程圖 TC + MESH SC pins

## Before → After
| Surface | v1.60 | v1.61 |
|---------|-------|-------|
| Group CREATE | 创建 | **建立** |
| Group CONSTRUCT | 构造 | **構造** |
| Group SELECT | 选择 | **選擇** |
| Group EXPORT / PARAMETERS / MAKE | 导出／参数／制造 | **導出／參數／製造** |
| Tab SOLID / MESH / SHEET METAL | 实体／网格／钣金 | **實體／網格／鈑金** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-RZL7dM7B-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.61-20260919-114937` |
| Previous (kept) | `/var/www/webcad-releases/v1.60-20260919-114549` |
| nginx root | **sites-available + sites-enabled** → v1.61 release |
| current symlink | → `v1.61-20260919-114937` |
| entry md5 | `6213f529ae03ef24af8527f5d38e8c41` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.61-20260919-114937;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.61-20260919-114937;
```

## Verification
- Public entry `index-RZL7dM7B-r2.js` ✓ md5 match ✓
- Live contains `1.61`, CREATE:`建立`, CONSTRUCT:`構造`, SELECT:`選擇`, SOLID:`實體`, MESH:`網格`, "SHEET METAL":`鈑金` ✓
- Live retains 裝配工程圖／建立草圖／直線／翻轉曲面／尺寸已拒絕／旋轉／掃掠／插入STL网格 ✓
- SC chrome orthography gone: CREATE:`创建` / CONSTRUCT:`构造` / SELECT:`选择` / SOLID:`实体` / MESH:`网格` ✓
- Contracts v1.56–v1.61 static **PASS**

## BOT-D verify steps
1. Confirm version badge **1.61**
2. SOLID workspace → ribbon groups **建立**／**構造**／**選擇** (not 创建／构造／选择)
3. Workspace tabs **實體**／**網格**／**鈑金** (not 实体／网格／钣金)
4. Regress: DRAWING **工程圖**＋**裝配工程圖**, SKETCH **直線**／**完成草圖**, **翻轉曲面**, MESH insert STL SC toast unchanged
