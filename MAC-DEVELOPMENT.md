# Mac 本地開發

分支 `migration/mac-cad`；原始快照基準 `93cf69f`，來源 Windows commit `85695c68c24e7fdc816fc573d4181c992ed62fab`。

使用 Node v26.5.0、pnpm 11.19.0 已完成 frozen 安裝及 production build。

```sh
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 5173 --strictPort
pnpm build
pnpm preview --host 127.0.0.1 --port 4173 --strictPort
pnpm test:core
pnpm test:all
```

開發網址 http://127.0.0.1:5173/ ，production 本地預覽 http://127.0.0.1:4173/ 。`?ui-test=1` 停用文件 persistence 及分享連結自動載入，適合隔離畫布測試。正常網址支援自動恢復；請用檔案選單儲存 JSON 作可靠備份。

保留自訂 `src/kernel/replicad_plus.*`，不要換 stock OCCT。保留 pnpm-lock.yaml；pnpm 11 的 sharp build 已用 pnpm-workspace.yaml allowBuilds 明確配置。

本輪沒有正式部署；歷史 HANDOVER 的自動部署指令不適用。舊部署契約測試只接受 password-only guard，與現有 key-or-password guard 不符，仍是已知 baseline failure。meshfit 500ms 效能門檻在全套負載下出現一次失敗，單獨重跑通过。不得宣稱全套全部綠燈。

詳盡驗收、5 個預覽回歸案例的 before/after、模型 JSON/STEP/STL/PNG 及執行日誌在本次任務根目錄 `outputs/`。FrameLens Mac CLI 未找到，本次按交接 fallback 用 CUA 真畫布操作、AX 及截圖驗收；沒有 VLM 聲稱。

後續優先：大型文件存檔／重開、全域 document revision／applyFeatures 競態、Undo/Redo 重建失敗原子性、Safari 全流程、原生 Fusion／實體觸控板對照。
