# DEPLOY-RESULT v1.65

**Date:** 2026-09-19 12:25 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/135 — MERGED → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** MESH / UTILITIES export labels + File menu Export → HK Traditional

## Root cause
After ZH chrome (v1.61) EXPORT group already shows **導出**, and SHEET EXPORT already uses **導出STL／導出STEP**, but MESH tab EXPORT and UTILITIES MAKE still used Simplified **导出***; File ▾ Export rows likewise.

## Ship contents
- Ribbon MESH EXPORT: **導出STL／導出裝配STL／導出裝配OBJ／導出裝配3MF／導出裝配STEP／導出glTF/GLB／導出OBJ／導出3MF**
- Ribbon UTILITIES MAKE: **導出STL／導出STEP／導出glTF**
- File ▾: **導出 STL／導出 STEP／導出 3MF／導出 OBJ／導出裝配 STL／導出 glTF/GLB／導出視圖 PNG**
- i18n EN_LABEL TC keys + legacy SC retained
- APP_VERSION **1.65** + contract `grok-qa-v1.65-mesh-export-traditional`
- Keeps MESH insert SC pin / DRAWING 裝配工程圖 / SKETCH / illegal 尺寸已拒絕 / SELECT 選擇 / SHEET/PLASTIC / Shell-bake / ZH chrome / v1.64 construct

## Before → After
| Surface | v1.64 | v1.65 |
|---------|-------|-------|
| MESH exportstl | **导出STL** | **導出STL** |
| MESH exportasmstl | **导出装配STL** | **導出裝配STL** |
| UTILITIES exportstep | **导出STEP** | **導出STEP** |
| File ▾ Export STL | **导出 STL** | **導出 STL** |
| File ▾ Export Assembly STL | **导出装配 STL** | **導出裝配 STL** |
| File ▾ Export View PNG | **导出视图 PNG** | **導出視圖 PNG** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-DWVxw5lU-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.65-20260919-122416` |
| Previous (kept) | `/var/www/webcad-releases/v1.64-20260919-121954` |
| nginx root | **sites-available + sites-enabled** → v1.65 release |
| current symlink | → `v1.65-20260919-122416` |
| entry md5 | `4bc10c404d31c8eb97df8c0bf3dc8838` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.65-20260919-122416;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.65-20260919-122416;
```

## Verification
- Public entry `index-DWVxw5lU-r2.js` ✓ md5 match ✓
- Live contains `1.65`, 導出STL／導出裝配STL／導出視圖 PNG ✓
- Live retains 裝配工程圖／尺寸已拒絕／插入STL网格／選擇／烘焙為零件實體／已抽殼／參數／新實體／構造幾何 ✓
- Contracts v1.65 + v1.61–v1.64 static **PASS**

## BOT verify steps (hard refresh)
1. Version badge **1.65**
2. MESH → EXPORT **導出STL／導出裝配***; UTILITIES → MAKE **導出STL／導出STEP**
3. File ▾ **導出 STL／導出裝配 STL／導出視圖 PNG**
4. Regress: MESH insert STL SC, DRAWING 裝配工程圖, illegal 尺寸已拒絕, SELECT 選擇, Shell 已抽殼 / bake 烘焙為零件實體, construct 參數／新實體／構造幾何
