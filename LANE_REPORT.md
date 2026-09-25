# Lane grok-tc 報告（v2.03 港繁／英文整句翻譯）

工作目錄：`lane/grok-tc`。只改本 worktree。沒有 push、部署、改 nginx／VPS、改 `package.json` 依賴，也沒有刪測試。

## 提交

1. `f6c16d8` `i18n: replace status phrases only on whole-string match`
2. `a55d964` `i18n: convert FEA, mold, CAM, BOM, drawing, and status copy to zh-HK`
3. 本報告（隨後的 commit）

## 1. 英文模式不再做單字子串替換

`tStatus`（`src/i18n.ts`）以前把簡體／繁體詞表由長到短、由左至右做**子串**最長匹配。單字或短詞因此會嵌進中文詞中間，例如：

- `時間軸` 裡的 `軸` → `Axis`
- `點擊`／`節點` 裡的 `點` → `Points`
- `圓管` 裡的 `圓` → `Circle`
- `平面四連杆` 裡的 `平面` → `plane`
- `自動` + `重建` → `Autorebuild`

現在 en／ja **只在整句或整詞與詞表 key 完全相同**時才替換。沒有完整英文就原樣顯示中文，不再半中半英。zh-HK 仍原樣；zh-CN 仍整句轉簡體。長方體／圓柱等參數化 toast、尺寸拒絕標記，繼續走原本的整句 regex／catalog，不經子串掃描。

已補的完整英文（整句 key）：

- 時間軸提示：`參數化時間軸 — 建模後特徵出現在這裏，點擊任意節點可改參數並自動重建`
- 圓管／襯套 ribbon tip，以及 store 裡較長的圓管／襯套狀態句
- 平面四連杆 ribbon tip

`圓`、`點`、`軸`、`平面` 這類短詞**只有整條字串就係該詞**時先譯成英文。

測試：`tests/i18n-no-partial-substitution.test.mjs`。

## 2. 簡體 → 港式繁體（只改用戶看得到的字）

用詞：`导出`→`匯出`、`导入`→`匯入`、`保存`→`儲存`、`文件`→`檔案`、`默认`→`預設`。`數據` 保持 `數據`。註解沒改。幾何／計算沒改。

簡體舊 key 留在 `STATUS_PHRASES`；新增的港繁整句 key 在 `STATUS_PHRASES_X`（445 條），英文沿用舊譯（有的話）。

| 檔案 | 大約改了幾多 |
| --- | --- |
| `src/components/Viewport.tsx` | 212 行。範圍只限 FEA 面板、模流面板、CAM（車削／銑削／3D 加工）對話框、BOM 對話框與「匯出 BOM」按鈕。含約 194 條字串字面量，其餘是同一面板裡的 JSX 文字（例如「約束」「靜力／模態」）。 |
| `src/components/DrawingPanel.tsx` | 110 條用戶可見字串（圖紙、標註、BOM、匯出）。 |
| `src/App.tsx` | 17 條（Esc 狀態、無障礙名稱等）。 |
| `src/store.ts` | 約 1860 條 `status`／toast。包括「重建失敗」「已陣列」「已匯出裝配 STEP」，以及裝配 STL／OBJ／3MF／STEP 的狀態句。另有 6 個下載檔名 `-裝配.stl／.obj／.3mf／.step`。 |
| `src/i18n.ts` | 新增 445 條港繁 whole-string key；簡體 legacy key 保留。 |

## 3. 刻意沒改

- 風洞／水洞面板（`Viewport.tsx` 約 5585–5724 行，標題仍是「风洞 / 水洞」）、`src/components/Wind*.tsx`、`src/analysis/windtunnel.ts`、`src/analysis/lbm/*`。
- 註解。
- 上述範圍以外的 Viewport（草圖底欄、特徵對話框等）同其他元件。
- `src/ribbon.ts` 的源字串仍是「圓管/衬套」「平面四連杆」（不在第 2 項範圍）。英文模式已有整句翻譯，不會再切成 Circle／plane。
- store 裡**不是** status／toast 的字串（例如部分內部錯誤、註解、非狀態 prompt）。
- 粵文判斷詞「系」多數保留，沒有一律改成「係」，避免誤傷「系統」。

## 4. 測試

兩次功能 commit 之前都跑過，結果相同：

- `pnpm build`：成功（`tsc -b` 無 error，vite build 成功）。
- `node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/i18n-no-partial-substitution.test.mjs tests/grok-qa-v2.03-bd2301-sketch-tips-tc.test.mjs`：14 項全部通過。

## 5. 尚未處理

- 英文模式對**動態**狀態句（帶數字、檔名、插值）如果沒有整句 key，會顯示整句中文，而不是以前那種拼出來的英文。這是第 1 項的取捨：寧願整句中文，也不要中英夾雜。
- 風洞／水洞全文仍是另一條線的簡體／混雜用字。
- Viewport 其餘面板、Ribbon 源 tip、store 非 status 字串，仍有簡體殘留。
