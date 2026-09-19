# V166 FIX PLAN — LAB 齒輪／機構／傳動 labels Traditional Chinese (HK)

**Ship:** APP_VERSION **1.66** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.65 (stamp v1.65-20260919-122416) — MESH/UTILITIES/File 導出* TC

## Choice
**🧪實驗室 傳動設計／機構 ribbon labels + closely coupled dialog titles → Traditional Chinese (HK).**

Highest-value leftover after v1.65: gear/mechanism UI under LAB still shows Simplified **齿轮／齿条／蜗杆／四连杆…**. Main ribbon stays Fusion-like (P0); tools remain under 實驗室 (do NOT move onto SOLID — BUG-BD-6401).

| id / surface | SC (now) | TC (ship) |
|--------------|----------|-----------|
| panel 传动设计 | 传动设计 | **傳動設計** |
| panel 机构 | 机构 | **機構** |
| gear | 齿轮 | **齒輪** |
| gear child | 正齿轮/斜齿轮 | **正齒輪/斜齒輪** |
| worm | 蜗杆 | **蝸桿** |
| crowngear | 冠齿轮 | **冠齒輪** |
| gearbox | 齿轮箱 | **齒輪箱** |
| rack | 齿条 | **齒條** |
| pulley | V带轮 | **V帶輪** |
| fourbar | 四连杆机构 | **四連桿機構** |
| slidercrank | 滑块曲柄 | **滑塊曲柄** |
| sixbar | 六杆机构 | **六桿機構** |
| calc (LAB 工具) | 工程计算 | **工程計算** |
| FD_TITLE gearbox | 齿轮箱向导 | **齒輪箱向導** |
| FD_TITLE gear/rack/… | 齿轮／齿条／… | **齒輪／齒條／…** |
| dialog fourbar | ⬚ 四连杆机构（闭环） | **⬚ 四連桿機構（閉環）** |
| dialog slidercrank | ⊙ 滑块曲柄机构（活塞） | **⊙ 滑塊曲柄機構（活塞）** |
| dialog sixbar | ⬡ 六杆机构（Stephenson-III） | **⬡ 六桿機構（Stephenson-III）** |
| calc menu | 齿轮啮合参数 | **齒輪嚙合參數** |
| Timeline / BrowserTree | same feature labels | TC aligned |

## Fix
1. `ribbon.ts` LAB 傳動設計／機構／工程計算 labels → TC
2. `Viewport.tsx` FD_TITLE + mechanism dialog titles + calc 齒輪嚙合參數
3. `Timeline.tsx` + `BrowserTree.tsx` feature chrome labels
4. `i18n.ts` EN_LABEL TC keys (retain legacy SC); STATUS_PHRASES TC→EN; STATUS_PHRASES_X identity for dialog chrome
5. `CommandPalette.tsx` keywords include 齒輪／齒條／蝸桿／… aliases
6. APP_VERSION **1.66** + contract `grok-qa-v1.66-lab-gear-mechanism-traditional`

## Do not
- Move 新實體／實體布爾／整體偏移／齒輪* onto SOLID (stay under 實驗室)
- Regress 插入STL网格, 裝配工程圖, 尺寸已拒絕, 選擇, 導出STL, Shell/bake TC, v1.64 construct, ZH chrome, MESH export TC
- Mass-rewrite HelpPanel / long tip encyclopedias / store toast bodies mid-sentence
- CloudAgent — Grok direct only
