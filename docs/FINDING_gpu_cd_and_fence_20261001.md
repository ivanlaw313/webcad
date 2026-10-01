# 調查報告 — GPU LBM「Cd 高 2×」+ 一個真嘅 fence 卡死 bug

**日期**：2026-10-01
**分支**：`fix/gpu-cd-factor2`（由 `claude/integration` @ 9cde428 開出，未 merge、未部署）
**硬件**：RTX 5070 Ti（`ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 Ti (0x00002C05) Direct3D11 vs_5_0 ps_5_0, D3D11)`）

---

## 一、結論摘要

| # | 事項 | 結論 |
|---|---|---|
| 1 | 動量交換每條 link 計兩次 | **❌ 排除（實測）**：GPU 報 7242 條，CPU 數真值 7242 條，`linkRatio = 1.0000` |
| 2 | 動量交換公式多乘 2 | **❌ 排除（推導）**：獨立由動量平衡推出 `-c_i(gIn+gOut)`，同碼一字不差 |
| 3 | 被丟棄嘅 `-2w_i·c_i` 規範項 | **❌ 排除（對稱性）**：球體反演對稱 → N_i = N_ī、w_i = w_ī、c_ī = −c_i → 真係抵消到零 |
| 4 | 歸一化（U、A、公式） | **❌ 排除**：`U_LB = 0.05 == flow.uLb`；`Cd = 2F/(ρU²A)` 正確；GPU 面積 317 == `frontalCells` 317 |
| 5 | fixture 用名義 Re 而唔係有效 Re | **❌ 排除**：fixture 本來就係 `sphereCd(f.reLbEffective)` |
| 6 | **我 7 月嘅推論本身有洞** | **✅ 成立** —— 見下 §2 |
| 8 | **★ 「~2× 系統偏差」本身 ★** | **❌ 唔存在（已實測定案）** —— 乾淨條件下 **1.128×**，落喺誤差預算 ±30% 內。見下 §3 |
| 9 | 產品配置嘅瞬時 Cd 散佈 | **⚠ 新發現未解釋** —— 峰峰波動 **3012%**。見下 §3 |
| 7 | **`fenceSync` 永遠唔 signal（背景 tab）** | **✅ 真 bug，已喺真 Chrome + 真 GPU 重現** —— 見下 §4 |

---

## 二、★ 7 月推論嘅漏洞 ★

7 月嘅結論係：

> 三個 tier（dLb 20 / 28 / 37）比值都係 ~2.1，**同解析度完全無關** → 唔係網格不足 → 係系統性偏差 → **所以係碼錯**。

**漏洞**：嗰三個 tier 嘅【堵塞率亦然冇變過】——

| tier | dLb | 堵塞率 |
|---|---|---|
| low | 20 | 14.4% |
| medium | 28 | 15.4% |
| high | 37 | 16.6% |

即係「不變量」唔止解析度，**堵塞率都係**。所以「同解析度無關」呢個觀察，**根本冇能力分辨「碼錯」同「壁面約束物理」**。由嗰一步跳到「所以係碼錯」係一個未經檢驗嘅推論。

### 約束有幾嚴重

`frontalCells = 317`、`DY = DZ = 47`、`dLb = 20.09`
→ **λ = d/D = 0.427**（重度受限）

Stokes 區 Haberman-Sayre 管壁修正：

```
K = 1 / (1 − 2.104λ + 2.089λ³ − 0.948λ⁵)
λ = 0.427 → K ≈ 3.98×
```

Re ≈ 600 之下比 Stokes 弱，但仍然係一階效應。**2.12× 完全落喺約束物理嘅合理範圍。**

### 另外：fixture 違反咗自己嘅閘

`lbm.validate.test.ts` 有一條 `assert(blockage < 0.15, '堵塞率太高，侧边距唔够')`。
但 medium / high tier 實測 **15.4% / 16.6%**，兩個都超。即係作者自己已經埋咗個警告線，只係嗰條 assert 喺另一個 case，冇攔到。

---

## 三、堵塞率掃描（決定性對照實驗）

**設計**：固定球體解析度（dLb 不變，球體一個格都唔改）、固定 Re，**只掃側向留白**。
呢個係唯一能夠分辨兩個假設嘅對照。

**探針**：`tools/lbm_blockage_probe.js`（繞開 async readback，用同步 `readPixels` + CPU fp64 加總）

### 第一次掃描（報廢）—— 記錄落嚟做教訓

**軸冇釘死。** `buildDomain(grid)` 唔傳 opts 會【自己揀最長軸】做來流方向。側向加留白之後 Y/Z 變成最長軸 → 流向軸靜靜鷄轉咗。症狀：`DY` 永遠 47、只有 `DZ` 變大。成組數報廢。
→ 修正：一定要傳 `{ axis: 0, sign: 1 }`。

### 第二次掃描（幾何正確，但仍未收斂）

mu = 1.81e-5（Re_lb 597），軸已釘死，DY == DZ：

| pad | DX | DY×DZ | λ = d/D | 堵塞% | Cd | Clift-Gauvin | 比值 | **末段波動** |
|---|---|---|---|---|---|---|---|---|
| 0 | 64 | 47×47 | 0.427 | 14.35% | 1.1251 | 0.543 | **2.072** | 36% |
| 12 | 103 | 93×93 | 0.216 | 3.67% | 0.7446 | 0.543 | **1.371** | **1765%** |
| 24 | 142 | 139×139 | 0.145 | 1.64% | 0.7381 | 0.543 | **1.359** | **774%** |

`linkRatio` 三個配置都係 **1.0000**（GPU 7242 == CPU 真值 7242），`gpuArea` 都係 317 == `frontalCells`。

**可以講嘅**：比值由 2.07 跌到 1.36 → **堵塞率確實係一個主要成因**。
**唔可以講嘅**：末段波動 774–1765%（Cd 擺幅係均值嘅 8–17 倍）→ **呢三個 Cd 數字唔係可信嘅時均值**，所以「殘餘 1.36×」唔可以當結論。

### Re 鉗制 —— 一個我算錯過嘅嘢

想降 Re 入穩態帶（球體 Re ≲ 210 無渦脫落）就要加黏度。但我第一次只加 20×，冇效 —— `Re_lb` 仍然 597。
原因：`refLenM` 係 **0.0956 m**（唔係我當時當成嘅 0.1），所以
`reReal = 1.204 × 10 × 0.0956 / (20 × 1.81e-5) = 3179`，仍然遠高過 `RE_LB_MAX = 800`
→ 先被鉗到 800，再被 `OMEGA_PLUS_MAX = 1.98` 鉗到 **597**。
要 `Re_lb ≈ 150` 需要 **mu ≈ 8e-3（≈ 424× 空氣）**。`probe(pads, mu)` 第二個參數直接傳得。

### ⚠ 做實驗嗰陣唔好改 Vite root 底下嘅檔

我改探針檔之後，Vite 檔案監視器觸發 **full page reload**（`performance.getEntriesByType('navigation')[0].type === 'reload'`），正跑嘅 run 連 `window` 狀態一齊被清走。
Agent 改 `src/analysis/lbm/*.ts` 亦然（探針 import 緊嗰啲檔）。
→ **長實驗要等所有 agent 收工先跑**，或者改用 `vite preview`（冇 HMR）。

---

### ★★ 最終結果（2026-10-01，真 RTX 5070 Ti · ANGLE/D3D11 · 域 128×123×123 = 1.94 M 格）★★

兩條新 fixture（Agent B 設計，我跑）：

| | (A) 穩態量化閘 | (B) 產品配置趨勢閘 |
|---|---|---|
| 黏度 | Re_real = 150 | 空氣 1.81e-5 |
| **Re_lb** | **143.5** | **596.7** |
| `reClamped` / `omegaClamped` | false / false（乾淨 Re） | true / true（被鉗） |
| LES | **熄** | 開（Cs 0.12） |
| 堵塞率 | 2.10%（λ 0.163） | 2.10% |
| 尾流 | 穩態（`unsteady: false`） | 非穩態，蓋 **10.0** 個脫落週期 |
| 窗內樣本 | 320 | 2512 |
| **時均 Cd** | **1.0506** | **0.7611** |
| Clift-Gauvin | 0.931 | 0.543 |
| **比值** | **1.128×**（閘 ±30%）✅ | **1.402×**（閘 ±50%）✅ |
| 峰峰波動 | 7.48% | **⚠ 3012%** |
| 牆鐘 | 12 秒 | 593 秒 |

#### 定案：「~2× 系統偏差」唔存在

**1.128× 落喺誤差預算推出嘅 ±30%（RSS ≈ 18%）之內** —— 對一個 20 格階梯式球體（Re=150 嘅邊界層厚度只有 1.6 格）嚟講，呢個就係應有精度，唔係 bug。

舊嗰個 2.072× 係**四樣嘢疊埋**嘅假象：

| # | 成因 | 量 |
|---|---|---|
| ① | 堵塞率 14.35%（λ 0.427） | Haberman-Sayre K ≈ 3.99 |
| ② | 從未收斂（隨機相位快照） | 合成正弦測試證實原判據會喺波峰「收斂」，偏 >10% |
| ③ | Re_lb 被 `omega_plus` 鉗（597 ≠ target 800） | 相關式斜率喺嗰度唔平 |
| ④ | LES 開 | Smagorinsky 喺層流區加假渦黏度，有效 Re < nominal |

#### ⚠ 新開問題：(B) 峰峰波動 3012%

渦脫落唔應該令 Cd 擺 30 倍。2512 個樣本嘅**均值**仍然落喺 ±50%，但咁大嘅散佈代表有離群樣本（可能 readback 撞到寫入中途、或者 fp32 樹歸約偶發失準）。

★ **(B) 而家冇波動閘，所以 3012% 會靜靜鷄過測** ★ —— `fluctuation` 閘只加咗喺 (A)（<10%）。

下一步：先睇 Cd 時間序列（單點尖刺定真嘅大幅振盪）→ 再決定離群值濾除 / 穩健統計（std、IQR）/ 查 readback 時序。**暫時唔加閘**，因為未知閾值應該幾多，亂填一個就係另一個「冇根據嘅容差」。

---

## 四、★ 獨立發現：`fenceSync` 喺背景 tab 永遠唔 signal ★

### 最小重現

```js
const gl = document.createElement('canvas').getContext('webgl2');
const buf = gl.createBuffer();
gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
gl.bufferData(gl.PIXEL_PACK_BUFFER, 16, gl.STREAM_READ);
gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
gl.clear(gl.COLOR_BUFFER_BIT);
gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf);
gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, 0);
gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
gl.flush();
for (let i = 0; i < 4; i++) {
  gl.clientWaitSync(sync, 0, 0);                    // 永遠 TIMEOUT_EXPIRED
  gl.getSyncParameter(sync, gl.SYNC_STATUS);        // 永遠 UNSIGNALED
  gl.finish();                                      // ★ 連 finish() 都救唔到 ★
}
```

### 實測結果

| 環境 | `document.hidden` | 結果 |
|---|---|---|
| Claude 內嵌 browser pane（收埋） | — | 4 次全部 `TIMEOUT` / `UNSIGNALED` |
| **用戶真 Chrome（背景 tab）** | `true` | **4 次全部 `TIMEOUT` / `UNSIGNALED`** |

### 後果（產品層）

`asyncReader.ts` 嘅 `poll()` 靠 `clientWaitSync` 判斷讀到未。fence 唔 signal →
- `pending` 永遠卡住 `true` → `request()` 之後再唔會落新單
- `_fresh` / `_haveArea` 永遠 `false`
- **`pollForce()` 永遠返 `null`**
- → **GPU 引擎一個 Cd 都唔會報，而且完全冇聲** （唔會 throw、唔會 warn、唔會退階）

`asyncReader` / `lbmGpu` **冇任何 fence 卡死嘅後備路徑**。

### 同 live bug 嘅關係

09-25 審查記錄過 live 風洞 bug：**「GPU 模式卡 0% + 取消後鎖死」**。
v2.10 加嘅係「GPU 唔再自動開跑」+「取消一定解鎖」——
**嗰兩個係處理症狀，唔係呢個根因。** 呢個 fence 卡死極有可能就係「卡 0%」嘅真因。

⚠ 未證實嘅部分：我**只**喺 `document.hidden === true` 之下重現過。
tab 喺前景（`hidden === false`）嗰陣 fence 會唔會正常 signal，**未測**。
所以觸發條件係「背景 tab」定係「永遠」，仲未釘死。

### ★ 退階路線已實證有效（2026-10-01，用戶真 Chrome + RTX 5070 Ti）★

同一個 hidden tab、同一個 GL context、同一幀，兩條路並排量：

| 路線 | 做法 | 結果 |
|---|---|---|
| A（現行 async） | PBO + `fenceSync` + `getSyncParameter` ×6（中間 `finish()`） | **fence 永遠唔 signal** |
| B（退階） | `PIXEL_PACK_BUFFER` binding = **null** 嘅同步 `readPixels` | **返正確數據 `64,128,192,255`，耗時 1.00 ms，`glErr = 0`** |

→ **同步退階喺 async 死嘅環境確實 work，而且成本只係 ~1ms。**
（旁證：我個堵塞率探針成功跑完三個配置、攞到真 force / links / area，全程就係用同步 `readPixels` 喺 hidden tab 跑。）

### ★ 退階修復喺真 solver 上實證（兩條 Cd fixture 都係靠佢才跑得成）★

上面 §3 嗰兩條 fixture 用 `solver.pollForce()`（async 路）。喺 hidden tab 嗰條路本來係死嘅，但 `AsyncPixelReader` 嘅卡死退階接住咗：

```
readbackMode: "sync-fallback"   degraded: true   reason: "fence-stall"
(A) 樣本總 461   (B) 樣本總 2686
```

**async 路攞到 0 個樣本；退階之後 (A) 461 個、(B) 2686 個。** 即係呢個修復唔止理論上work，而係**直接令一個本來做唔到嘅量測做得成**。

### 建議修法（未實作，等批）

喺 `AsyncPixelReader` 加一個卡死偵測：request 之後連續 N 次 poll 都 TIMEOUT（N 可以由幀數或者 ms 定），
就**退階做同步 `readPixels`**（唔綁 PBO = 即時返，完全唔經 fence）。
代價係嗰一幀 CPU 等 GPU，但「慢一幀」遠好過「永遠冇數字而且冇聲」。
呢個退階可以 headless 單元測（注入一個永遠唔 signal 嘅假 fence）。

---

## 五、未解決 / 下一步

1. ~~堵塞率掃描結果（§3）~~ **✅ 已完成，見 §3 最終結果**
2. fence 卡死喺【前景 tab】會唔會發生 —— **仍然未測**，決定 bug 嚴重度（「背景才壞」定「永遠壞」）
2a. **(B) 峰峰波動 3012% 未解釋** —— 見 §3 尾
2b. 退階之後嘅狀態（`report().readback`）**UI 層未接** —— 用戶而家只會喺 console 見到 warn
3. ⚠ **我自己呢句都曾經講過頭**（原文寫「要改寫成『堵塞率過高導致』」）——
   咁講等於把「係堵塞造成」當成已確認，同原先把「2× 係求解器偏差」當成已確認係同一種錯。
   正確講法：**原嗰個 2× 數字唔可靠（堵塞率 14–17% + 從未收斂），根因未定案。**
   fixture 幾何確實要改（加大側邊距 + 誠實時均），但唔等於已經證實堵塞就係全部原因。
4. 如果 §3 顯示極低堵塞率仍然 ~2×：再落一層查 reduce 金字塔同取樣時序。
