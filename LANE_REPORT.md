# Lane grok-tc2 報告（其餘面板港繁）

工作目錄：`lane/grok-tc2`。只改本 worktree。沒有 push、部署、改 nginx／VPS、改 `package.json` 依賴，也沒有刪測試。註解、幾何與控制流沒改。

## 提交

1. `c529d4b` `i18n: convert ribbon labels and tips to zh-HK`
2. `d36f554` `i18n: convert browser, timeline, joints, and slice copy to zh-HK`
3. `3a47238` `i18n: convert remaining Viewport panels to zh-HK`
4. `398c844` `i18n: convert remaining store status strings to zh-HK`
5. `b914eec` `i18n: lock simplified-Chinese string leak count`
6. 本報告（隨後的 commit）

每次功能 commit 之前 `pnpm build` 成功（`tsc -b` 無 error，vite build 成功），並跑過 `tests/i18n-no-partial-substitution.test.mjs` 與 `tests/entrypoints-discoverable.test.mjs`。第 5 項再加 `tests/zh-hk-no-sc-leak.test.mjs`，三份一共 10 項通過。

## 做了甚麼

上一輪（`docs/LANE_REPORT_grok-tc.md`）已把 FEA／模流／CAM／BOM／工程圖同 store 主要 status 轉成港繁，英文模式改為整句匹配。今次清指定檔案裡用戶看得到的簡體，並把用詞收成同一套：

- 檔案（檔案選單、存檔名）。瀏覽器「文件設定」維持 Fusion 港繁叫法，catalog `tree.docSettings` 本來已是「文件設定」，沒有改成「檔案設定」。
- 儲存、匯出、匯入、預設、設定（不再用保存／導出／導入／默認／設置）。
- 數據維持「數據」。機械連桿、螺紋桿用「桿」。粵文「晒」「系」「唔」「嘅」沒有一律改寫，避免誤傷「系統」或口語。

改的是字串常量和 JSX 文字。比較式裡的鍵（例如 `info.kind === '最小曲率半径'`）沒動，以免同未改的產生端脫節。

若某句原本會經 `STATUS_PHRASES`／`STATUS_PHRASES_X`／`EN_LABEL` 整句譯成英文，新的港繁整句加了同一句英文；簡體和舊的「導出…」鍵留着。Ribbon 標籤另外寫入 `LABEL_TO_KEY`，日文／簡體標籤表沿用舊譯。`zh-HK` catalog 裡非 alias、非風洞／氣動的顯示句，同步改成匯出／匯入／儲存／預設。搜尋 alias 仍保留簡體詞，方便簡體輸入找命令。

## 各檔大約改了幾多字串

| 檔案 | 字串 |
| --- | --- |
| `src/ribbon.ts` | 125（含標籤「匯出STL」等，以及圓管／襯套、平面四連桿 tip） |
| `src/components/Ribbon.tsx` | 28 |
| `src/i18n/locales/zh-HK.ts` | 52 條顯示句；`group.EXPORT` 由「導出」改「匯出」 |
| `src/components/BrowserTree.tsx` | 51 |
| `src/components/Timeline.tsx` | 16 |
| `src/components/IntroCard.tsx` | 2（「揀」） |
| `src/components/Tour.tsx` | 1（「跳過呢步」；其餘教學句上一輪已是港繁） |
| `src/components/JointsPanel.tsx` | 100 |
| `src/components/SlicePanel.tsx` | 25 |
| `src/components/Viewport.tsx` | 829（風洞面板除外） |
| `src/store.ts` | 78 條 status／toast |
| 英文整句新 key | 約 160 條 `STATUS_PHRASES_X`，另有 ribbon 的 `EN_LABEL` |

`HelpPanel.tsx`、`CommandPalette.tsx`、`InspectorPanel.tsx` 的用戶可見字已是 catalog 或港繁，沒有改字（簡體只在註解）。`PhysicsLab.tsx` 掃過，沒有本輪字表裡的簡體專用字。

## 刻意沒改

- `src/components/Wind*.tsx`、`src/analysis/windtunnel.ts`、`src/analysis/lbm/*`、`src/aero/*`、`src/components/AeroLab*.tsx`。
- `Viewport.tsx` 風洞／水洞面板（約 5587–5730 行，標題仍是「风洞 / 水洞」）。
- `store.ts` 風洞求解（約 22205–22296 行）以及任何含「风洞／風洞／水洞」的 status。
- store 裡不是 status／toast 的字串、全部註解、正則、以及比較運算元。
- 行尾：這些檔本來是 LF，沒有改成 CRLF。

## 回歸鎖

`tests/zh-hk-no-sc-leak.test.mjs` 掃描上列檔案的字串常量（不含註解、不含正則），計算含「这们为设计实体点击选择删图线面边转换导输显现动开关无时间轴数据件页进标维连杆」任一字的條數，上限 **2383**。

這個數不是「尚餘 2383 句簡體」。字表裡的「面」「除」「件」在正確港繁裡也會出現（面、刪除、零件），風洞面板和 store 非 status 字串也故意留着。分檔：Viewport 473、Ribbon 13、ribbon.ts 227、BrowserTree 74、Timeline 39、Tour 8、Joints 15、PhysicsLab 20、store 1514，其餘 0。上限不准為了新簡體字往上調。

## 尚未處理

- 英文模式對沒有整句 key 的動態 status，仍顯示整句中文（上一輪的取捨）。
- 風洞／水洞全文、store 非 status 字串、以及各檔註解，仍有簡體。
- `alias.*` 故意保留簡體搜尋詞。
