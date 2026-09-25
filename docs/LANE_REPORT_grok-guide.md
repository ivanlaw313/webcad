# Lane grok-guide 報告（氣動／水動使用教學）

工作目錄：`lane/grok-guide`。只改本 worktree。沒有 push、部署、改 VPS、加依賴，也沒有刪測試。

`src/aero/*`、`AeroLab*.tsx`、`AeroCfdPanel.tsx`、`WindCfdVerify.tsx`、風洞計算邏輯沒有改。

## 提交

1. `616c70c` `docs: add zh-HK and English aero/hydro user guides`
2. `e3dee3e` `help: add aero/hydro guide section and command search`
3. `698dea5` `help: check aero guide section and four-locale keys`
4. 本報告（隨後的 commit）

每次 commit 之前 `pnpm build` 成功（`tsc -b` 無 error，vite build 成功），並跑過：

`node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/aero-guide-help.test.mjs tests/zh-hk-no-sc-leak.test.mjs tests/entrypoints-discoverable.test.mjs`

9 項全部通過。

## 做了甚麼

寫咗一份畀 Fusion 360 用家、唔使寫程式嘅教學，港式繁體同英文各一份：

- `docs/AERO_GUIDE_zh-HK.md`
- `docs/AERO_GUIDE_en.md`

內容包括：

- 三層點分：① 氣動設計實驗室工程估算（毫秒到幾秒，用嚟排名，多數偏低約三成）② 瀏覽器風洞 LBM（趨勢級，比較形狀；GPU 嘅 Cd 大約高 2 倍）③ 本機 OpenFOAM（要開 `start-service.bat`，Chrome 允許本機網絡存取；球體 Cd 0.490 對參考約 0.47）。
- 逐步撳邊個掣：120mm 靜音風扇範本、一句說話設計滑翔機翼、一句說話設計最低水阻水底推進器外殼、插入後用普通 CAD 改再匯出 STL、送頭 N 個去 CFD 睇校準系數、風洞加「用 OpenFOAM 驗證呢個形狀」。
- 已知限制：螺旋槳 CFD 未驗證、LBM 絕對 Cd 係趨勢、估算要校正、GPU 風洞 Cd 有約 2 倍偏差。
- 常見問題：服務未開、瀏覽器擋本機網絡、計太耐、結果同估算唔同。

軟件入面：

- 說明（F1）加咗一節「⑧ 氣動／水動設計」。港繁同英文寫齊三層、步驟、限制、常見問題。簡體中文同日文係精簡版。四語 key 一樣。
- 說明該節有「指給我看」，指向「氣動設計實驗室」。
- 按 `/` 搜「氣動」「CFD」「風洞教學」「aero guide」會見到「氣動／水動設計教學」，撳咗就打開說明。

## 刻意沒改

- 氣動計算、實驗室面板、CFD 面板、風洞面板同風洞求解。
- `C:\ClaudeCode\aero-cfd-service`（只讀過 README）。
- 依賴、測試刪除、部署。

## 驗證

`tests/aero-guide-help.test.mjs` 靜態檢查說明有呢節、四語 key 齊、指令別名含上面四個搜尋字。冇開瀏覽器走一次畫面；呢次係說明同文件，按鈕名稱係對住現有畫面字串寫嘅。
