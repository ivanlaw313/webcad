# Lane grok-guide4 報告（網格修正後嘅教學）

工作目錄：`lane/grok-guide4`。只改本 worktree。沒有 push、部署、加依賴，也沒有刪測試。氣動計算、CFD 面板、自動設計循環都沒有改。

## 提交

1. `510cb7c` `docs: update aero guide after the coarse-mesh visibility fix`
2. 本報告（隨後的 commit）

commit 之前 `pnpm build` 成功（`tsc -b` 無 error，vite build 成功），並跑過：

`node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/aero-guide-help.test.mjs tests/zh-hk-no-sc-leak.test.mjs`

5 項全部通過（說明測試 4 項，簡體漏字測試 1 項）。

## 做了甚麼

CFD 服務修正咗「模型比背景網格細、網格程式睇唔到表面、粗網格阻力大幅偏高」。教學入面所有網格講法改成修正後嘅事實，並刪走舊數字同舊結論：0.29、0.173、0.171、0.111、555×84 mm、233 萬格／94 分鐘、「coarse 高 2–3 倍」、「medium 偏高五成」、「medium 更接近 fine」、黃字警告、coarse 只係試跑。

`docs/AERO_GUIDE_zh-HK.md`、`docs/AERO_GUIDE_en.md` 而家寫：

- 修正後同一個 555×73 mm 流線外殼（水 2 m/s）：coarse 21 萬格、1.4 分鐘、Cd 0.1096；medium 59 萬格、7.7 分鐘、0.1090；最細網格 269 萬格、71 分鐘、0.1048。coarse／medium 同最細網格只差約 4–5%。工程估算 0.115（差約 10%）。6:1 橢球差約 2–4%。
- 細長物件（長度 ÷ 等效直徑 > 3）用穩態 SST 時，服務自動用 streamlined-rans。
- CFD 驗證同自動設計預設網格 **coarse**（大約 1–5 分鐘，誤差約 5%）。最後確認可以用 medium 或 fine。
- 揀網格旁邊係一行灰色說明，唔再係黃色警告。
- 模型假設全湍流；真實可能有自然轉捩，阻力再低 30–50%。只驗證咗零攻角旋轉體。

螺旋槳「部分驗證」（靜態 −12%、功率 −3%、前飛 22–36%／標籤 20–35%）沒有改。

說明（F1）精簡版唔係寫喺 `HelpPanel.tsx`（嗰度只係 i18n key）。對應句喺 `src/i18n/locales/zh-HK.ts` 同 `en.ts` 嘅 `help.pAero*`。簡體同日文精簡版同一套網格結論都改咗，避免切語言之後仲寫預設 medium、粗網格高估。`tests/aero-guide-help.test.mjs` 改咗舊 assert（預設 medium、555×84、差約 4%），並禁止舊 Cd。測試冇刪。

風洞面板「用 OpenFOAM 驗證呢個形狀」喺本 worktree 仍然寫死送 medium、面板冇網格選項。教學有分開寫明，冇講成預設 coarse。

## 刻意沒改

- `src/components/HelpPanel.tsx`：冇網格句子可改。
- `AeroCfdPanel.tsx`、`AeroAutoLoop.tsx`、`aeroI18n.ts`、`autoLoop.ts`：本 worktree 程式仍然預設 medium，而且只喺揀 coarse 時出黃色 `cfdCoarseWarn`。任務唔准改呢啲檔。教學係按今次畀嘅最新介面事實（灰色說明、預設 coarse）寫嘅。
- 螺旋槳部分驗證段落。
- `C:\ClaudeCode\aero-cfd-service`。
- 依賴、測試刪除、部署。

## 驗證

靜態測試同上。冇開瀏覽器走一次說明畫面：呢次係文件同說明字串，面板掣名沿用現有標籤。
