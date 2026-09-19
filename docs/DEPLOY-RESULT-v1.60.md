# DEPLOY-RESULT v1.60

**Date:** 2026-09-19 11:48 HKT  
**PR:** https://github.com/ivanlaw313/webcad/pull/123 (MERGED → `feat/native-car-stage1-20260906`)  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** **裝配工程圖 discoverable** — close BUG-BD-5601 (ZH_GROUP deferred → v1.61)

## Root cause
BOT-D @ v1.58 PARTIAL: part DRAWING modal TC OK, but **裝配工程圖** absent.
String only appeared in File → 裝配工程圖 + BOM, or modal head when `drawingKind==='assembly'`.
DRAWING ribbon had only **工程圖**; icons-only BOT-D never opened the assembly path.

## Ship contents
- DRAWING ribbon: `asmdrawing` label **裝配工程圖** (quick icon) → `generateAsmDrawing`
- Drawing modal kind tabs always show **工程圖** / **裝配工程圖**
- TC status: 正在生成／已生成／失敗／冇可見組件 **裝配工程圖…**
- File menu already TC **裝配工程圖 + BOM**; CommandPalette alias
- APP_VERSION **1.60** + contract `grok-qa-v1.60-assembly-drawing-discoverable`
- Keeps part DRAWING modal TC, SKETCH, 翻轉曲面, illegal, SOLID CREATE residual, MESH SC pins

## How to open 裝配工程圖 (BOT-D)
1. Ribbon **DRAWING** → icon **裝配工程圖** (needs ≥1 visible component), **or**
2. Ribbon **工程圖** → modal kind tab **裝配工程圖**, **or**
3. File → **裝配工程圖 + BOM**

## Before → After
| Surface | v1.59 | v1.60 |
|---------|-------|-------|
| DRAWING ribbon | 工程圖 only | **工程圖** + **裝配工程圖** |
| Drawing modal | head only when assembly | kind tabs always show **裝配工程圖** |
| Asm status toast | SC 装配工程图… | TC **裝配工程圖…** |

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-COrg3OQp-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.60-20260919-114549` |
| Previous (kept) | `/var/www/webcad-releases/v1.59-20260919-113814` |
| nginx root | **sites-available + sites-enabled** → v1.60 release |
| current symlink | → `v1.60-20260919-114549` |
| entry md5 | `cd7f012bd3c58ac9f01798c232eb89c6` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.60-20260919-114549;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.60-20260919-114549;
```

## Verification
- Public entry `index-COrg3OQp-r2.js` ✓ md5 match ✓
- Live contains `1.60`, `裝配工程圖`, part/asm modal heads, 前視圖／俯視圖／右視圖 ✓
- Live retains 建立草圖／直線／翻轉曲面／尺寸已拒絕／旋轉／掃掠／插入STL网格 ✓
- Contracts v1.56–v1.60 static **PASS**

## BOT-D verify steps (close BUG-BD-5601)
1. Confirm version badge **1.60**
2. DRAWING workspace → see ribbon icon **裝配工程圖**
3. Click **工程圖** (part) → modal shows kind tab **裝配工程圖** + head **工程圖 — 三視圖 + 立體圖** + 前視圖／俯視圖／右視圖
4. (Optional) New Component ×2 → click **裝配工程圖** → head **裝配工程圖 — 三視圖 + 氣泡 BOM**
5. Regress: SKETCH 直線／完成草圖, 翻轉曲面, MESH insert STL SC toast unchanged
