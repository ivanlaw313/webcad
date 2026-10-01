# GROK BOT — WebCAD QA v3.0 任務書

**發出**：2026-10-01
**目標站**：https://cad.neuralworkshk.com/
**被測版本**：**v__VERSION__**（bundle `assets/__BUNDLE__`）
**上一輪**：v2.14 QA 最終報告（2026-10-01，103 案例、72 條未關閉 bug、0 P0）

---

## 0. 一句話

上一輪你交咗一份好報告。呢一輪有三件事：
1. **重驗我哋已經修咗嘅嘢**（§2）
2. **攻返上次因為環境限制而測唔到嗰批**（§3 —— ★ 本輪最大增量 ★）
3. **繼續掃未關閉嘅 72 條 + 未覆蓋嘅面**（§5）

---

## 1. ★ 版本凍結 ★

開工第一步（唔做唔准開始）：

| 檢查 | 應該見到 |
|---|---|
| F12 → Network → 主 bundle | `assets/__BUNDLE__` |
| `https://cad.neuralworkshk.com/sw.js` | 內含 `webcad-v__VERSION__` |
| 介面 badge | `WebCAD · version __VERSION__` |

三樣有任何一樣對唔上 → **即刻停手通知總經理**。

測試期間唔會出新版。中途發現 bundle hash 變咗而冇人通知你 → 當異常，通知。

---

## 2. ★ 已修，請重驗 ★

以下係本輪由 v2.14 → v__VERSION__ 嘅改動。**每條都要你獨立重驗**，結果寫 `FIXED` / `STILL_OPEN` / `PARTIAL`，沿用原 bug ID。

__FIXED_TABLE__

---

## 3. ★★ 本輪最大增量：解開上次三個環境死結 ★★

上一輪你報告 §9 列咗三個環境限制，令**成組案例**變 PARTIAL/SKIP：

| 死結 | 影響嘅案例 |
|---|---|
| box 瀏覽器攔截 `showOpenFilePicker` | BUG-001 Open、BATCH0、UI05、SO03/SO04 持久性 |
| 外部 STL/OBJ 匯入被攔（檔案選擇器 + 拖放都唔得） | **成組 ME01–ME04**、ME 相關 bug |
| 冇 GPU（`MAX_COLOR_ATTACHMENTS=6`） | P2-WIND-3、P2-WIND-4、大網格、GPU 渲染 |

**頭兩個今次有解。** 做法如下。

### 3.1 開 `?ui-test` 取得測試鈎

```
https://cad.neuralworkshk.com/?ui-test
```

加咗 `?ui-test` 之後，`window.useApp` 會曝露出嚟（Zustand store）。
呢個唔係隱藏後門 —— 係產品本身為咗 UI 測試而設嘅鈎，`?ui-test` 亦會跳過自動還原上次設計，所以每次都係乾淨開局。

### ★ 使用紀律（總經理明確授權 + 明確界線）★

你上一輪自己定嘅規矩係「唔注入 JS、唔用隱藏 API」。我**部分解除**呢條，界線如下：

**✅ 准用 `window.useApp`：**
- **夾具準備**（setup）：載入一個 STL／打開一份存檔 —— 即係你環境做唔到嗰啲
- **讀數驗證**：讀精確體積／尺寸／特徵樹，取代靠截圖同屬性面板估

**❌ 唔准用 `window.useApp`：**
- **執行被測試嘅操作本身**。畫草圖、拉伸、倒角、改尺寸…… **一律要用 UI 真撳**。
  用 store 直接 call 一個 action 去「完成」一個操作，就唔再係測緊個產品。

**📝 記錄要求**：任何一行用咗 `useApp` 做 setup 或讀數嘅 case，喺 `limitations` 欄明寫
`「setup 經 useApp（環境攔截檔案選擇器）」` 或 `「數值經 useApp 讀取」`。
咁我哋先分得清「UI 真係 work」同「我哋繞過咗 UI」。

### 3.2 繞過檔案選擇器開檔（解 BUG-001 / BATCH0 / UI05）

```js
// 1) 先用 UI 正常「儲存」一份 JSON（呢步係測緊嘅嘢，要用 UI）
// 2) 讀返個 JSON 內容（你嘅 box 可以讀 ~/Downloads）
// 3) 用 store 還原 —— 呢步係 setup，因為你個 harness 攔住 showOpenFilePicker
const json = JSON.parse(savedJsonText)
await window.useApp.getState().applyProjectData(json, '已打開項目')
```
之後**用 UI** 檢查：實體在唔在、特徵樹對唔對、體積有冇變。
→ 咁就真係驗到「存檔往返幾何無損」，而唔係再寫一次「環境限制未驗」。

### 3.3 繞過檔案選擇器匯入 STL（解成組 ME01–ME04）

**唔使外部檔案**，自己喺 JS 生成一個二進位 STL：

```js
function makeBoxSTL(w, d, h) {                    // 回傳 ArrayBuffer（binary STL）
  const v = [[0,0,0],[w,0,0],[w,d,0],[0,d,0],[0,0,h],[w,0,h],[w,d,h],[0,d,h]];
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],
             [1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
  const buf = new ArrayBuffer(84 + f.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, f.length, true);
  let o = 84;
  for (const t of f) {
    o += 12;                                       // 法向留 0，閱讀器會自己算
    for (const i of t) { dv.setFloat32(o, v[i][0], true); dv.setFloat32(o+4, v[i][1], true); dv.setFloat32(o+8, v[i][2], true); o += 12; }
    o += 2;
  }
  return buf;
}
// setup：餵落去（繞過被攔截嘅檔案選擇器）
window.useApp.setState({ insertMesh: {
  kind: 'stl', buf: makeBoxSTL(40, 30, 20), name: 'test-box.stl',
  unit: 'mm', flipUp: false, place: 'center',
}});
```

→ 40×30×20 盒 = **24000 mm³**，你有一個精確已知答案可以對。
→ 想測破網格／大網格，改個生成器（刪幾個三角 = 有洞；細分 = 幾萬三角）。
→ **之後所有操作（網格轉實體、修復、meshfit、量度）一律用 UI。**

另一條路（更接近真實流程）：**先用 UI 匯出 STL，再用上面方法匯入返** —— 咁連 export/import 往返都測埋。

### 3.4 GPU 仍然冇解

你個 box 係軟件 WebGL（`MAX_COLOR_ATTACHMENTS=6`，GPU 風洞要 7）。呢個我哋改唔到。
→ P2-WIND-3、P2-WIND-4、GPU 路徑**繼續標 `SKIP(無 GPU)`**，唔好當 bug。
→ 但 **CPU 風洞路徑要照測**（P2-WIND-1/2/5 上次 PASS，今次做快速 regression 就夠）。

---

## 4. 已知限制 —— 唔准開新 bug

| 項 | 狀態 |
|---|---|
| GPU 風洞模式（需 7×RGBA32F） | 你個 box 冇 GPU，`SKIP(無 GPU)` |
| 本機 OpenFOAM CFD 服務（127.0.0.1:8765） | 跑喺總經理部機，你連唔到，`SKIP(本機服務)` |
| AI 助手需 API key | `SKIP(需憑證)` |
| GPU 風洞**絕對** Cd | 只係趨勢級。2026-10-01 已喺真硬件查證：乾淨條件下 1.13× Clift-Gauvin，落喺數值誤差內。**舊嗰句「有 2× 系統偏差」已經證實唔成立並已刪除** |
| 瀏覽器 LBM 絕對 Cd | 趨勢級（解析度 + Re 鉗制 + LES） |
| 轉子前飛推力偏低 20–35% | 已知（翼型近似） |
| CFD 全湍流，自然轉捩未模擬 | 已知 |
| 多目標模板自動模式只用第一目標排名 | 已知 |
| CAM／鈑金／工程圖／數據 = **凍結模組** | bug 一律 P2，排最後做 |

---

## 5. 本輪測試範圍（優先序）

你話額度多 —— 咁就按呢個次序掃，**深度 > 覆蓋率**。

### P0：重驗 §2 已修項
每條 5–15 分鐘。**最先做**，因為結果直接決定我哋聽日改咩。

### P1：上次因環境限制而未驗嘅（用 §3 嘅方法）
| 案例 | 上次結果 | 今次用 |
|---|---|---|
| BATCH0 | PASS（Open 未驗） | §3.2 |
| BUG-001 重驗 | PARTIAL（Open 未驗） | §3.2 |
| UI05 文件安全與多頁 | PARTIAL | §3.2 |
| SO03 / SO04 持久性 | PARTIAL（重開未驗） | §3.2 |
| **ME01 匯入與單位** | PARTIAL | §3.3 |
| **ME02 網格轉實體及孔** | PARTIAL | §3.3 |
| **ME03 破網格與修復** | PARTIAL | §3.3（生成有洞嘅 STL） |
| **ME04 meshfit 超時及取消** | FAIL | §3.3（生成幾萬三角） |

### P2：未關閉 P1 bug 逐條重驗（25 條）
按你上次 §12 嘅主題分組做，一個主題一輪：
1. 參數化重建／持久面命名：BUG-250、214、257、203
2. 特徵幾何：BUG-297（拔模）、267（倒角）
3. 陣列／偏移：BUG-207、208、209、299
4. 掃掠／放樣／抽殼：BUG-258、259、261
5. FEA 數值：BUG-289
6. BOM／裝配：BUG-287、288
7. 孔／螺紋：BUG-262、263、264、265
8. 草圖區域／撤銷：BUG-212、247、202
9. Form／網格：BUG-283、286

### P3：未關閉 P2（42 條）+ P3（5 條）

### P4：新覆蓋面（上次完全冇掂過）
如果仲有額度，呢啲係上次 103 個案例冇覆蓋到嘅：
- **單位系統**：mm ↔ inch 切換之後，所有已有尺寸／體積／標註有冇正確換算？分數輸入（1/4）？
- **撤銷／重做深度**：連續 30 步操作後逐步 Undo 再逐步 Redo，幾何有冇漂移？
- **大檔性能**：200+ 特徵嘅時間軸，scrub 去頭再去尾，要幾耐？有冇記憶體洩漏（DevTools Memory）？
- **瀏覽器重新整理中途**：操作到一半 F5，自動儲存有冇救返？救返嘅嘢啱唔啱？
- **並發**：同一份設計開兩個 tab 同時改，會唔會互相覆寫？（上次 BUG-UI-006 修過，驗返）
- **極端輸入**：0、負數、1e9、NaN、超長名稱、emoji 名稱 —— 應該**明確拒絕並講原因**，唔好靜默改值
- **鍵盤全鍵路**：淨用鍵盤（Tab/Enter/Esc/方向鍵）行完一次「草圖→拉伸→圓角→存檔」

> ★ 「極端輸入」嗰項特別重要 ★ —— 你上次搵到三條同類（BUG-279 數量靜默夾 64、BUG-290 FEA 力值 0→50、BUG-299 抑制實例）。
> **靜默改用戶輸入**係呢個 app 嘅一個病根。見到就開 bug，唔好當小事。

---

## 6. 報告格式（沿用上輪，唔改欄位）

| 檔 | 內容 |
|---|---|
| `results.csv` | 欄位同上輪完全一樣（20 欄） |
| `bugs.json` | 同上輪結構 |
| `checkpoint.json` | 每 2 小時 |
| `REPORT.md` | 進度摘要 + P0/P1 + 各組結果 |
| `evidence/` | 截圖、下載檔、錄影 |
| `SHA256SUMS` | 全包雜湊 |

- **Bug ID 由 `BUG-401` 開始**（避開上輪 201–302）
- 重驗舊 bug：**沿用原 ID**，status 寫 `FIXED` / `STILL_OPEN` / `PARTIAL`
- status 取值：`PASS` / `FAIL` / `PARTIAL` / `MISSING` / `NOT_RUN` / `SKIP`
- 嚴重度：P0 資料遺失／核心工作流阻塞｜P1 功能錯但有 workaround、幾何／數值錯｜P2 UI／易用性｜P3 文案

### 每條 bug 必須有
1. 重現步驟（由新檔開始，逐步，要人跟得到）
2. 期望 vs 實際 —— **有數字一定要寫數字**
3. 截圖
4. `limitations` 欄：如果用咗 §3 嘅 `useApp` 做 setup 或讀數，**一定要寫明**
5. 版本欄：`v__VERSION__` / `__BUNDLE__`

---

## 7. 回報節奏

- 每 2 小時 checkpoint
- **遇到 P0（資料遺失／核心流程阻塞）即刻通知**，唔好等成輪完
- 做完 §5 P0（重驗已修項）就交一次中期，唔使等全部完成 —— 嗰批結果決定我哋下一步改咩

---

## 8. 幾何基線（對數用）

| 件 | 體積 | 三角 |
|---|---|---|
| box 40×30×20 | 24000 mm³ | 12 |
| shell_2（上蓋開口、壁厚 2） | 7152 mm³ | 28 |
| sphere(a=18) | 24284.99 mm³ | 2426 |
| cylinder r10 h40 | 12566.37 mm³ | 164 |

原語枚舉：`box / sphere / torus / cone / wedge / dome / halfcyl / pie`（用 a/b/c 參數；**冇 cyl**；sphere 半徑 = a）。

> ⚠ 你上輪 §8A 提出 `fillet_r5 23783.16` / `chamfer_3 23980` 對唔上單邊倒角實測（23820）。
> **你講得啱** —— 嗰兩個歷史數字冇記低基準件嘅邊數同落邊位置，所以無法重現。
> 本輪**唔好再用嗰兩個數對**；上面四個係可重現嘅。多謝你捉到。
