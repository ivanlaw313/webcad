# Lane grok-wind-tc 報告（風洞／水洞港繁）

工作目錄：`lane/grok-wind-tc`。只改本 worktree。沒有 push、部署、改 nginx／VPS、改 `package.json` 依賴，也沒有刪測試。註解、幾何與控制流沒改。`src/aero/*`、`AeroLab*.tsx` 沒動。

## 提交

1. `6889408` `i18n: convert wind tunnel panel copy to zh-HK`
2. `e78e62d` `i18n: convert Wind* component user-facing copy to zh-HK`
3. `767c019` `i18n: convert wind tunnel store status toast confirm and report to zh-HK`
4. `bb24d05` `i18n: convert wind tunnel analysis warnings and notes to zh-HK`
5. `dd2c482` `i18n: add zh-HK wind tunnel whole-string English keys`
6. `f95ae16` `i18n: lock simplified-Chinese string leak count after wind tunnel TC`
7. 本報告（隨後的 commit）

每次功能 commit 之後 `pnpm build` 成功（`tsc -b` 無 error，vite build 成功），並跑過：

`node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/wind-cp-drag.test.mjs tests/wind-busy-cancel.test.mjs tests/wind-gpu-driver.test.mjs tests/zh-hk-no-sc-leak.test.mjs tests/i18n-no-partial-substitution.test.mjs`

17 項全部通過。風洞測試沒有 assert 簡體期望字串，測試邏輯沒改。

## 做了甚麼

上一輪（`docs/LANE_REPORT_grok-tc2.md`）刻意留下風洞／水洞全文。今次把用戶看得到的簡體轉成港繁，用詞收成同一套：

- 運行、計算、結果、趨勢、體素、空氣、虛擬、流場、匯出、下載、報告、壓力、自動、精細、預設、設備、來流、收斂、相對、比較、絕對、請、圖、線、選、實體、活動、匯入、網格、組件、經驗、驗證。
- `導出`→`匯出`、`导入`→`匯入`、`默认`→`預設`。`數據` 維持「數據」。`分辨率` 沿用上一輪 FEA 寫法，沒改成「解析度」。
- `拖拽`→`拖曳`。粵文「唔」「嘅」「係」沒有一律改寫。

改的是字串常量和 JSX 文字。註解、比較運算元、計算公式沒動。`store.ts` 在 git 裡是 LF，保持 LF。

會經 `STATUS_PHRASES_X` 整句譯成英文的，新港繁整句加了同一句英文；簡體 legacy key 留在 `STATUS_PHRASES`。動態 status（帶數字、插值）沒有整句 key，英文模式仍顯示整句中文——同上一輪的取捨。

## 各檔大約改了幾多字串

| 檔案 | 字串 |
| --- | --- |
| `src/components/Viewport.tsx` | 風洞面板約 46 條（標題「風洞 / 水洞（LBM 體素趨勢）」、運行／重新運行／計算中、空氣／風阻、下載報告、清除結果等） |
| `src/components/WindLegend.tsx` | ZH 圖例 15 條 |
| `src/components/WindPoseCompare.tsx` | ZH 浮卡 11 條 |
| `src/components/WindSmoke.tsx` | 1 條 fallback status |
| `src/components/WindStreaks.tsx` | 1 條 fallback status |
| `src/components/WindTunnelGpu.tsx` | 約 26 條 status／warning／進度 |
| `src/store.ts` | 33 條 status／toast／confirm／報告行／下載檔名 |
| `src/analysis/windtunnel.ts` | 流體名、進度 note、warning、Error |
| `src/analysis/windClient.ts` | `風洞計算已取消` |
| `src/analysis/lbm/*` | warning、note、reason、Error（poseCompare／convergence／probeMRT／lbmGpu／rigidPose／sdfBake） |
| 英文整句新 key | 約 29 條 `STATUS_PHRASES_X` |

## 刻意沒改

- `src/aero/*`、`src/components/AeroLab*.tsx`。
- 各檔註解、正則、以及比較運算元。
- store 裡不是風洞 status／toast／confirm／報告的字串。
- `WindObjectGizmo.tsx` 的 `console.warn`（開發者訊息）同 GPU DEV 探針 assert 字串。
- 行尾：`store.ts` 維持 LF（與 git blob 一致）；其餘目標檔本來是 LF。

## 回歸鎖

`tests/zh-hk-no-sc-leak.test.mjs` 掃描上列檔案的字串常量（不含註解、不含正則），計算含「这们为设计实体点击选择删图线面边转换导输显现动开关无时间轴数据件页进标维连杆」任一字的條數，上限 **2357**（由 2384 降下來；刪走「+1 = wind-fix merge」註解）。

分檔：Viewport 462、Ribbon 13、ribbon.ts 227、BrowserTree 74、Timeline 39、Tour 8、Joints 15、PhysicsLab 20、store 1499，其餘 0。這個數不是「尚餘 2357 句簡體」——字表裡的「面」「除」「件」在正確港繁裡也會出現。上限不准為了新簡體字往上調。

## 尚未處理

- 英文模式對沒有整句 key 的動態 status（例如 `風洞：體素化…（空氣 @ 20 m/s）`、`GPU 風洞：…%`），仍顯示整句中文。
- store 非 status 字串、以及各檔註解，仍有簡體。
- `alias.*` 故意保留簡體搜尋詞。
