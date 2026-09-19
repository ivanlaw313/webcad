# V161 FIX PLAN — ZH_GROUP / ZH_TAB chrome Traditional Chinese

**Ship:** APP_VERSION **1.61** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.60 (PR #123) — 裝配工程圖 discoverable; ZH_GROUP deferred here

## Choice
**ZH_GROUP / ZH_TAB chrome orthography → Traditional Chinese (HK)** — deferred from V160:
- ZH_GROUP: 创建→**建立**, 构造→**構造**, 选择→**選擇**, 导出→**導出**, 参数→**參數**, 制造→**製造**
- ZH_TAB: 实体→**實體**, 网格→**網格**, 钣金→**鈑金**
- Already TC retained: 約束／檢查／裝配／工程圖／對稱／修改／完成／插入／配置／造型／曲面／管理／工具／塑料

## Root cause
Ribbon group titles (`tGroup`) and workspace tabs (`tTab`) still used Simplified glyphs while tool labels (v1.48–v1.60) moved to TC. Visible chrome mismatch on every workspace.

## Fix
1. `src/i18n.ts` ZH_GROUP + ZH_TAB → TC mappings above.
2. APP_VERSION **1.61** + contract `grok-qa-v1.61-zh-group-tab-traditional`.
3. Do **not** touch tip bodies, MESH toast/DnD SC pins (`插入STL网格`), SKETCH/DRAWING/illegal/SOLID residual/裝配工程圖.

## Do not
- Convert MESH toast / DnD SC pins (v1.41–1.44).
- Mass-rewrite tip bodies / status phrases.
- Regress DRAWING 工程圖／裝配工程圖, SKETCH 直線／完成草圖, 翻轉曲面, 尺寸已拒絕, 旋轉／掃掠.
