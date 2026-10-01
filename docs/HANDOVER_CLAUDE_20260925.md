# WebCAD 交接 — Claude 2026-09-25（v2.03 → v2.14）

## 1. 源碼、分支、發版

| 項目 | 值 |
|---|---|
| 本機工作樹 | `C:\ClaudeCode\webcad-v2`（`core.autocrlf=false`） |
| 整合分支 | `claude/integration`（已 push 去 VPS `root@38.242.215.29:/srv/git/webcad.git`） |
| 基底 | `handover/v2.03` 6e06800（Grok Bot 交接；GitHub `ivanlaw313/webcad` `feat/native-car-stage1-20260906` = b2c5bd9，**已落後**，未 push） |
| 發版 | `wsl -d Ubuntu -- bash /mnt/c/ClaudeCode/webcad-v2/tools/release_wsl.sh claude/integration <版本>` |
| 版本號 | 每版改 `src/version.ts` APP_VERSION + `public/sw.js` CACHE（`webcad-v<版本>`），腳本會檢查 |
| Rollback | 將 `/etc/nginx/sites-available/cad.conf` **同** `sites-enabled/cad.conf` 嘅 `root /var/www/webcad-releases/<stamp>;` 改返上一個 stamp，`nginx -t && systemctl reload nginx` |

**一定要用 WSL（Linux）build**：Windows build 嘅 chunk 分組唔同；已驗證 WSL build 6e06800 同 live v2.03 逐 byte 一致。

## 2. 今日做咗乜

| 版本 | 內容 |
|---|---|
| v2.10 | 風洞 5 個 bug（阻力用校正 Cd；Cp 參考壓力，Cp_max 2.8→~1.1；GPU 唔再自動開跑；取消一定解鎖；Esc 要確認）；**氣動設計實驗室**（`src/aero/*`：NACA 翼型/面元法、VLM 機翼、BEMT 螺旋槳、流線殼阻力、CMA-ES / NSGA-II、AI brief、B-rep 生成）；AI 助手/生成式設計/熱分析入口；英文整句翻譯；大量簡→港繁 |
| v2.11–2.12 | 實驗室 ↔ 本機 OpenFOAM 服務（`cfdService.ts`、`AeroCfdPanel.tsx`、`WindCfdVerify.tsx`）；螺旋槳外觀（厚度漸變、橢圓葉尖、整流罩）；風洞面板港繁；Chrome「本機網絡存取」被擋時嘅提示 |
| v2.13 | **自動設計模式**（`autoLoop.ts`、`surrogate.ts` 高斯過程修正、`AeroAutoLoop.tsx`）；AI 助手 `aero_*` 工具；機翼圓翼尖；使用教學（F1 → 氣動）；10 個回歸測試修正 + 2 個真 bug（最小曲率半徑紅點、屬性質量單位） |
| v2.14 | CFD 預設網格 coarse（服務端網格 bug 已修，coarse 同最細網格差 ~5%）；轉子 CFD 標「部分驗證」；教學更新 |

## 3. 本機 CFD 服務 `C:\ClaudeCode\aero-cfd-service`

- 啟動：`start-service.bat`（或 `start-service.ps1` 隱藏視窗）→ `http://127.0.0.1:8765/health`
- OpenFOAM v2412 **直接裝喺 WSL2 Ubuntu**（唔再用 Docker），CPU MPI 12 核
- live 網站連本機：nginx CSP 已加 `http://127.0.0.1:8765 http://localhost:8765`；服務回 CORS + Private-Network；**用戶要喺 Chrome 允許「本機網絡存取」**
- 驗證（詳見服務 README）：
  - 球 Re 6.7e4（bluff-lowRe 層流瞬態）Cd 0.487–0.491 vs 0.47
  - 流線殼 555×73 mm：coarse 0.1096 / medium 0.1090 / 最細 0.1048（工程估算 0.115）
  - 6:1 橢球：0.0947 vs Hoerner 0.097
  - NACA0012 2D：10° 升力 1–4%
  - APC 10×4.7 螺旋槳：靜態 CT −12%、CP −3%；J 0.3–0.5 CT −22…−36%（部分驗證）
- 關鍵 bug（已修）：模型細過背景網格時 snappy「睇唔到」表面 → 自動 `refineHexMesh` 預先加密

## 4. 已知限制 / 下一步

1. 轉子前飛推力偏低 20–35%（相信主要係 APC 翼型近似）；要用翼型已知嘅螺旋槳再驗
2. CFD 全湍流模型，自然轉捩（低 Re 流線體可再低 30–50% 阻力）未模擬
3. 瀏覽器 LBM 風洞：絕對 Cd 趨勢級（球 ~0.70）；GPU 模式絕對 Cd 未經驗證（舊有「~2× 偏差」數字唔可靠：原實驗堵塞率 14–17% 且未收斂，唔係已確認缺陷；2026-10-01 更正）
4. 多目標模板（螺旋槳、機翼）自動模式只用第一個目標排名
5. 實驗室神經網絡快速代理（Transolver 等）未做 — 要累積數百個自己嘅 CFD 樣本先值得
6. `tests/` 仍有 ~214 個 v2.03 已存在嘅失敗檔（多數係舊版本/字串 pin），`npm run test:all` 喺 Windows 會卡喺 `browser-runner-process` → 用 `tools/per_file_tests.py` 逐檔比較
7. 仍有部分簡體字串（`tests/zh-hk-no-sc-leak.test.mjs` 鎖住上限防回退）

## 5. 工作線報告

`docs/LANE_REPORT_grok-*.md`（Grok 做嘅 i18n / 入口 / 教學）；使用教學 `docs/AERO_GUIDE_zh-HK.md`、`docs/AERO_GUIDE_en.md`。
