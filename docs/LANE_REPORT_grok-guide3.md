# Lane grok-guide3 報告（網格預設、估算準繩、轉子 CFD 部分驗證）

工作目錄：`lane/grok-guide3`。沒有 push、部署、改 VPS、加依賴，也沒有刪測試。

氣動計算、`src/aero/*`、`AeroLab.tsx`、`AeroAutoLoop.tsx`、`AeroCfdPanel.tsx`、CFD 服務都沒有改。教學對住而家嘅介面字寫。

## 提交

1. `e328132` `docs: update aero guide for medium mesh and partial rotor validation`
2. 本報告（隨後的 commit）

`e328132` 之前 `pnpm build` 成功（`tsc -b` 無 error，vite build 成功），並跑過：

`node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/aero-guide-help.test.mjs tests/zh-hk-no-sc-leak.test.mjs`

5 項全部通過（說明測試 4 項，簡體漏字測試 1 項）。

## 做了甚麼

`docs/AERO_GUIDE_zh-HK.md`、`docs/AERO_GUIDE_en.md` 刪走同新事實矛盾嘅舊講法（預設 coarse、估算同 CFD 一律差一至三倍、螺旋槳 CFD 未驗證），改成：

- **網格。** CFD 驗證同自動設計預設 **medium**。揀 coarse 會出黃字：coarse 會大幅高估細長／流線形狀嘅阻力（實測可以高 2–3 倍），只適合試跑。同一個 555×84 mm 流線外殼：coarse Cd≈0.29、舊 medium 0.173、fine（233 萬格，94 分鐘）0.111；工程估算 0.115。CFD 服務已按迎風等效直徑為細長物件加密，而家嘅 medium 會更接近 fine。0.173 係加密前嘅舊 medium。建議：第一次可以 coarse 睇流程，認真比較用 medium，最後確認用 fine。風洞面板「用 OpenFOAM 驗證呢個形狀」送 medium，冇 coarse 選項。
- **估算準唔準。** 對流線外殼，工程估算同細網格 CFD 差約 4%（0.115 對 0.111）。同粗網格 CFD 差好遠，係粗網格唔準，唔係估算錯。整體仍然建議用 CFD 校正；自動設計會學修正倍數。
- **螺旋槳／風扇 CFD。** 由未驗證改為部分驗證。同 UIUC 實測 APC 10×4.7 比：靜態推力 −12%、功率 −3%（達標）；前飛（進距比 J 0.3–0.5）推力偏低 22–36%（未達標，趨勢正確）。標籤「部分驗證（靜態推力 −12% / 前飛偏低 20–35%）」；自動設計剔選框「照用轉子 CFD（部分驗證：靜態準、前飛偏低）」。預設仍然唔送轉子 CFD。靜止風扇（來流 0）可以參考 CFD；有前進速度嘅螺旋槳，CFD 推力會偏細，睇相對排名。

F1 精簡版唔係寫喺 `HelpPanel.tsx`（嗰度只有 i18n key）。對應句喺 `help.pAero*`，所以改咗 `src/i18n/locales/zh-HK.ts` 同 `en.ts`。簡體中文同日文精簡版入面會矛盾嘅舊句（未驗證、一至三倍、預設 coarse）一併改走，避免另外兩種語言仲教舊講法。`HelpPanel.tsx` 本身冇句子可改，所以冇動。

`tests/aero-guide-help.test.mjs` 原本要求教學同精簡版寫「一至三倍」／“one to three times”。呢句已經同新事實矛盾，改為檢查 medium 預設、差約 4%、部分驗證標籤同剔選框，並且唔再出現「未驗證」／“NOT validated”／「一至三倍」。

## 刻意沒改

- 網格預設、黃字、轉子標籤嘅程式（`AeroCfdPanel.tsx`、`AeroAutoLoop.tsx`、`autoLoop.ts`、`aeroI18n.ts`）——已經係新行為，呢條 lane 只改教學。
- 英文自動設計黃字原因仍然係舊句 “rotor CFD is unvalidated and off by default…”。英文教學寫明呢句過時，跟剔選框同工作標籤。同一行後面嘅「轉子 MRF 結果未經實測數據驗證」都標咗過時，以 APC 對比為準。
- `src/ai/tools.ts`、`src/aero/aeroTools.ts` 仍然同模型講轉子 CFD 未驗證、網格預設 coarse。介面預設已經係 medium、標籤已經係部分驗證。呢啲工具說明唔喺今次檔案範圍。
- 依賴、測試刪除、部署。

## 驗證

`pnpm build` 成功。上面兩個測試 5 項通過。冇開瀏覽器走一次說明畫面：呢次係說明同文件，掣名同標籤係對住 `aeroI18n.ts`、`AeroCfdPanel.tsx`、`AeroAutoLoop.tsx`、`autoLoop.ts`、`WindCfdVerify.tsx` 嘅現有字串寫嘅。
