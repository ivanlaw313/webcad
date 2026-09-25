# grok-entry 工作線報告：隱藏功能入口

分支 `lane/grok-entry`。只改本工作目錄。未 push、未部署、未改 VPS、未加依賴、未刪測試、未改風洞檔（`Wind*.tsx`、`windtunnel.ts`、`lbm/*`）、未改 AI provider 邏輯。

## 功能係咪真係實作咗

| 功能 | 結論 | 求解器 | 結果顯示 |
| --- | --- | --- | --- |
| A. AI Copilot | 已實作，只係冇入口。`App.tsx` 只喺 `aiOpen` 為真時先掛載面板（約第 354 行），面板內嘅浮動按鈕因此永遠唔會出現。 | 唔適用（聊天面板，`src/components/AiCopilot.tsx` + `toggleAiPanel`） | 面板本身 |
| B. 生成式設計 / 拓撲優化（SIMP） | **真實存在**，唔係殘留字串。 | `src/analysis/voxelfea.ts` `runTopologyOpt`（第 2297 行）；`src/worker/fea.worker.ts` `topopt`（第 24 行）；`src/store.ts` `runTopoptSolve`（第 21823 行） | `src/components/Viewport.tsx` `TopoptOverlay` 密度體素雲（第 1802 行）+ 仿真面板柔度／體積／導出 STL（第 5470 行起） |
| C. 穩態熱分析 | **真實存在**，唔係殘留字串。 | `runVoxelThermal`（`voxelfea.ts` 第 2530 行）；worker `thermal`（第 28 行）；`runThermalSolve`（`store.ts` 第 21943 行） | `ThermalOverlay` 溫度雲（Viewport 第 1836 行）+ 面板溫度尺同總熱流 Q（第 5503 行起） |

同一塊仿真面板仲有「熱應力 FEM」（約束熱膨脹，`runVoxelThermalStress`）。任務只要求穩態熱分析，所以 ribbon 只加 `thermal`，熱應力仍然喺打開面板之後嘅原有按鈕，冇另開命令。

## 加咗嘅入口

命令 id：`aicopilot`、`topopt`、`thermal`。指令面板冇另一份清單，`CommandPalette.tsx` 的 `buildCommands` 會把每個 workspace ribbon 工具 id 收進去（搜尋用標籤、id、`tip.*`、`alias.*`）。

### A. AI 助手（`aicopilot`）

- 頂欄右上方按鈕「AI 助手」：`src/components/Ribbon.tsx` 第 490 行，呼叫 `runCommand('aicopilot')`。
- UTILITIES 分頁「助手」組：`src/ribbon.ts` 第 472 行（`quick: true`）。
- 分派：`src/store.ts` 第 13518 行 `toggleAiPanel()`。草圖／造型中仍然可用（`src/cad/commandAvailability.ts` 的 `VIEW_COMMANDS`）。
- 四語：`cmd.aicopilot` / `tool.aicopilot` / `tip.aicopilot` / `alias.aicopilot` / `group.ASSIST`（`src/i18n/locales/{zh-HK,zh-CN,en,ja}.ts`）。同義詞含 AI、copilot、助手。

### B. 生成式設計（`topopt`）

- 🧪實驗室 → 仿真組：`src/ribbon.ts` 第 245 行。
- 分派：`src/store.ts` 第 13519 行 → `openSimPanel('topopt')`（第 21440 行）。有實體就打開原有仿真面板並捲到 `sim-sec-topopt`（`Viewport.tsx` 第 5470 行）；求解同密度雲沿用既有實作。
- 四語同義詞含 generative、topology、生成式、拓撲／拓扑、トポロジー、SIMP。

### C. 熱分析（`thermal`）

- 同一仿真組：`src/ribbon.ts` 第 246 行。
- 分派：`src/store.ts` 第 13520 行 → `openSimPanel('thermal')`，捲到 `sim-sec-thermal`（`Viewport.tsx` 第 5503 行）。
- 四語同義詞含 thermal、熱分析、热分析、熱伝導。

## 快捷鍵

**Ctrl+Shift+A** 打開／關閉 AI 助手（`src/App.tsx` 第 108 行；ribbon 工具 `shortcut` 同第 472 行）。

事先 grep：已用嘅係 Ctrl+Shift+F（全屏）同 Ctrl+Shift+Z（重做）。Ctrl+Shift+A 之前冇用過。ribbon 入面 `Ctrl+Shift+A` 只出現一次。

## 測試同建置

`node --test tests/entrypoints-discoverable.test.mjs`

- 5 項全部通過，0 失敗（ribbon 有三個 id、指令面板由 ribbon id 索引、store 有分派、快捷鍵、四語 alias）。
- 每步 commit 之前 `pnpm build`（`tsc -b && vite build`）退出碼 0。

## Commits

1. `df9b1c8` `ui: add AI Copilot ribbon button, search aliases, and Ctrl+Shift+A`
2. `ea997ef` `ui: add Generative Design and steady-state Thermal on the Lab ribbon`
3. `38372c9` `ui: test that AI, generative, and thermal commands are discoverable`
4. 本報告：`ui: write grok-entry discoverability lane report`
