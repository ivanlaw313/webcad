# DEPLOY-RESULT v1.66

**Date:** 2026-09-19 12:38 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/137 — MERGED → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** LAB 齒輪／機構／傳動 labels + BUG-BD-6501 export-all chrome → HK Traditional

## Root cause
After v1.65 MESH/File 導出* TC, LAB 傳動設計／機構 ribbon + dialog titles still showed Simplified **齿轮／齿条／蜗杆／四连杆…**. BOT-D also found BrowserTree/ParamsPanel **导出全部*** SC leftover (BUG-BD-6501).

## Ship contents
- LAB panels **傳動設計／機構**; tools **齒輪／正齒輪/斜齒輪／蝸桿／冠齒輪／齒輪箱／齒條／V帶輪／四連桿機構／滑塊曲柄／六桿機構／工程計算**
- FD_TITLE + mechanism dialogs: **齒輪箱向導／⬚ 四連桿機構（閉環）／⊙ 滑塊曲柄機構（活塞）／⬡ 六桿機構…／齒輪嚙合參數**
- Timeline + BrowserTree feature chrome aligned
- **BD-6501:** BrowserTree **導出全部零件 STL(zip)**; ParamsPanel **導出全部配置／導入設計表**
- i18n EN_LABEL + STATUS TC keys; legacy SC retained
- APP_VERSION **1.66** + contract `grok-qa-v1.66-lab-gear-mechanism-traditional`
- Tools stay under 🧪實驗室 (NOT moved onto SOLID)

## Before → After
| Surface | v1.65 | v1.66 |
|---------|-------|-------|
| LAB gear | **齿轮** | **齒輪** |
| LAB rack | **齿条** | **齒條** |
| LAB worm | **蜗杆** | **蝸桿** |
| LAB crowngear | **冠齿轮** | **冠齒輪** |
| LAB gearbox | **齿轮箱** | **齒輪箱** |
| LAB fourbar | **四连杆机构** | **四連桿機構** |
| LAB slidercrank | **滑块曲柄** | **滑塊曲柄** |
| BrowserTree export-all | **导出全部零件 STL(zip)** | **導出全部零件 STL(zip)** |
| ParamsPanel | **导出全部配置** | **導出全部配置** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-Dr0cD_pb-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.66-20260919-123736` |
| Previous (kept) | `/var/www/webcad-releases/v1.65-20260919-122416` |
| nginx root | **sites-available + sites-enabled** → v1.66 release |
| current symlink | → `v1.66-20260919-123736` |
| entry md5 | `5e0a36265609783c16ea5ef0e599741c` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.66-20260919-123736;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.66-20260919-123736;
```

## Verification
- Public entry `index-Dr0cD_pb-r2.js` ✓ md5 match ✓
- Live contains `1.66`, 齒輪／齒條／蝸桿／四連桿機構／導出全部零件 STL(zip)／導出全部配置 ✓
- Live retains 裝配工程圖／尺寸已拒絕／插入STL网格／選擇／導出STL／烘焙為零件實體／已抽殼／參數／新實體／構造幾何 ✓
- Contracts v1.61–v1.66 static **PASS** (33)

## BOT verify steps (hard refresh)
1. Version badge **1.66**
2. 🧪實驗室 → 傳動設計 **齒輪／齒條／蝸桿／冠齒輪／齒輪箱／V帶輪**; 機構 **四連桿機構／滑塊曲柄／六桿機構**
3. BrowserTree (multi-comp) **導出全部零件 STL(zip)**; ƒx Params **導出全部配置**
4. Regress: MESH 插入STL网格 + 導出STL; DRAWING 裝配工程圖; illegal 尺寸已拒絕; SELECT 選擇; Shell 已抽殼 / bake; 新實體／實體布爾 stay under LAB (not SOLID)
