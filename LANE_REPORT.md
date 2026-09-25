# Lane grok-guide2 報告（自動設計同 AI 助手教學）

工作目錄：`lane/grok-guide2`。只改本 worktree。沒有 push、部署、改 VPS、加依賴，也沒有刪測試。

氣動計算、`src/aero/*`、`AeroLab.tsx`、`AeroAutoLoop.tsx`、`AeroCfdPanel.tsx`、AI 工具實作都沒有改。教學用字係對住面板同工具說明寫嘅。

## 提交

1. `ad83089` `docs: add auto-design section to the aero guides`
2. `383218b` `docs: add AI assistant section to the aero guides`
3. `a8ae025` `docs: correct estimate-versus-CFD accuracy wording`
4. `4a693bc` `help: add auto-design and AI assistant to the in-app aero guide`
5. 本報告（隨後的 commit）

每次 commit 之前 `pnpm build` 成功（`tsc -b` 無 error，vite build 成功），並跑過：

`node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/aero-guide-help.test.mjs tests/zh-hk-no-sc-leak.test.mjs`

最後一次 5 項全部通過（說明測試 4 項，簡體漏字測試 1 項）。

## 做了甚麼

上一輪教學（`docs/LANE_REPORT_grok-guide.md`）寫到手動優化、送 CFD、風洞。今次跟住新合併嘅「⑤ 自動設計模式」同 AI 助手工具，補兩節，並改走「估算偏低大約三成」。

`docs/AERO_GUIDE_zh-HK.md`、`docs/AERO_GUIDE_en.md`：

- **g) 自動設計模式。** 設定點揀：輪數（預設 3）、每輪 CFD 數（預設 2）、CFD 工作上限（預設 6）、時間上限（預設 120 分鐘）、改善少過 ε 就停（預設 0.01）。每輪係優化 → 揀頭 N 個唔同設計 → OpenFOAM → 修正模型學習 → 再優化。圖表：實線係 CFD 驗證，虛線係修正後估算。綠框「🏆 最佳已驗證設計」先至係留低嘅數，可以插入或者下載 STL／STEP；黃框只係估算。服務冇開或者瀏覽器擋住本機網絡，會變成「只用工程估算」。螺旋槳／風扇預設唔用轉子 CFD（未驗證）。關分頁或者重新整理，未跑完會自動再開實驗室並接返。
- **h) 叫 AI 助手幫你做。** 頂欄右上「AI 助手」（Ctrl+Shift+A），要自己喺 ⚙ 設定填 API Key。例子：「幫我設計一個 1.2 米翼展嘅滑翔機翼，用 CFD 驗證兩輪」。佢用 `aero_open_lab`、`aero_start_auto_design`、`aero_auto_design_status`、`aero_stop_auto_design`。冇 key 用唔到聊天，實驗室本身照用。
- **三層工具表**，連同校準例子、已知限制、常見問題：估算同 CFD 可以差一至三倍，視乎形狀同網格；要用 CFD 校正，自動設計模式會自動學。舊講法「偏低大約三成」只係用來講明唔好再記成永遠少三成。

說明（F1）「⑧ 氣動／水動設計」加咗兩段，key 係 `help.pAeroAuto`、`help.pAeroAi`。港繁同英文寫齊上面兩節；簡體中文同日文係精簡版。四語 key 一樣。同一段說明入面「低三成」都改成一至三倍。

`tests/aero-guide-help.test.mjs` 而家檢查：說明有呢兩段、四語 key 齊、港繁同英文有自動設計／最佳已驗證／只用估算／四個工具名、簡體同日文精簡但仍然有工具名、兩份教學有 g／h 而且唔再寫「偏低大約三成」／“about 30% low”。

## 刻意沒改

- 自動設計循環、修正模型、CFD 服務、AI 工具執行。
- `C:\ClaudeCode\aero-cfd-service`。
- 依賴、測試刪除、部署。

## 驗證

靜態測試如上。冇開瀏覽器走一次說明畫面：呢次係說明同文件，掣名同欄位係對住 `aeroI18n.ts`、`AeroAutoLoop.tsx`、`AiCopilot.tsx`、`src/ai/tools.ts` 嘅現有字串寫嘅。
