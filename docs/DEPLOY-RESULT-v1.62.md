# DEPLOY-RESULT v1.62

**Date:** 2026-09-19 12:01 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/128 (SHEET/PLASTIC) + https://github.com/ivanlaw313/webcad/pull/129 (BUG-BD-6101 fold) — MERGED → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** **SHEET/PLASTIC ribbon TC** + fold **BUG-BD-6101** (select 选择→選擇) before first live cut

## Root cause
1. Workspace tabs already **鈑金**／**塑料** (v1.61) while SHEET/PLASTIC tool labels still used Simplified glyphs.
2. BOT-D @v1.61 PARTIAL: default SOLID SELECT still showed Simplified **选择** (also MESH / UTILITIES).

## Ship contents
- SHEET: 钣金件→**鈑金件**, 薄板/法兰→**薄板/法蘭**, 导出展开DXF→**導出展開DXF**, 选择→**選擇** (+ tips)
- PLASTIC: 加强筋→**加強筋**, 选择→**選擇** (+ tip); SOLID CREATE 加強筋 companion
- Timeline / BrowserTree / FD_TITLE companion + EN_LABEL TC keys (legacy SC retained)
- **BUG-BD-6101:** all remaining ribbon `id: 'select'` → **選擇** (SOLID / MESH / UTILITIES) + tip; sk_select tip sync
- APP_VERSION **1.62** + contract `grok-qa-v1.62-sheet-plastic-traditional` (incl. BD-6101)
- Keeps DRAWING/SKETCH/illegal/SOLID residual/裝配工程圖 TC + MESH SC pins + ZH_GROUP/ZH_TAB

## Before → After
| Surface | v1.61 | v1.62 |
|---------|-------|-------|
| SHEET 钣金件／法兰／导出展开 | SC | **鈑金件／法蘭／導出展開DXF** |
| PLASTIC 加强筋 | SC | **加強筋** |
| SELECT tool (SOLID default) | **选择** | **選擇** |
| SELECT tip | 选择工具… | **選擇工具…** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-BStWdJ3r-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.62-20260919-120007` |
| Previous (kept) | `/var/www/webcad-releases/v1.61-20260919-114937` |
| nginx root | **sites-available + sites-enabled** → v1.62 release |
| current symlink | → `v1.62-20260919-120007` |
| entry md5 | `29fa827902a66b74695378b41e36e93f` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.62-20260919-120007;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.62-20260919-120007;
```

## Verification
- Public entry `index-BStWdJ3r-r2.js` ✓ md5 match ✓
- Live contains `1.62`, 鈑金件／薄板/法蘭／導出展開DXF／加強筋／選擇 ✓
- Live retains 裝配工程圖／建立草圖／直線／翻轉曲面／尺寸已拒絕／插入STL网格／建立／構造／實體／網格／鈑金 ✓
- SC select tip `选择工具：撳零件` gone; TC `選擇工具：撳零件` present ✓
- Contracts v1.61–v1.62 static **PASS**

## BOT-D verify steps (hard refresh)
1. Confirm version badge **1.62**
2. SOLID → SELECT tool label **選擇** (not 选择) — closes **BUG-BD-6101**
3. SHEET METAL → **鈑金件**／**薄板/法蘭**／**導出展開DXF**
4. PLASTIC → **加強筋**／**選擇**
5. Regress: DRAWING **工程圖**＋**裝配工程圖**, SKETCH **直線**／**完成草圖**, MESH insert STL SC toast unchanged
