# FISHING47 — WindTunnel Formal TC leftovers + Fusion CSS

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing47-sc-leftovers-fusion-css`  
**Base:** tip `59b4c75` (FISHING46 live; product = `fix/sketch-face-copy`)  
**Tip:** `5aadfbc` (`5aadfbc46ef1629ae00827b473acd9cf8ac5adcf`)

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–46 | **No new open P1** product bugs (Assemble closed FISHING39; revolve miss-cut = QA path vs section-check; FISHING45 recheck Formal PASS samples) |
| Residual SC after FISHING46 | convertible UV ~82 (WindTunnelGpu 25 + store 51 + WindSmoke/Streaks) |
| Prefer: WindTunnel SC-LEFTOVERS + residual UV Formal | **Converted** ~118 UV; **CSS-only** sketch-bar/ribbon/status rhythm |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF from 59b4c75 → this tip |

## Fixes

### 1. Formal TC — WindTunnel + residual UV (product)
- `src/components/WindTunnelGpu.tsx` — validation/OOM Formal: 格直徑／邊界層無法解、一條反彈 link、分配失敗 dispose、用完即棄、張 texture 無法救、密度擾動、均勻…
- `src/components/WindSmoke.tsx` / `WindStreaks.tsx` / `WindObjectGizmo.tsx` — GLSL comment Formal TC samples
- `src/store.ts` — 所有稜邊、參數化底板、漸開線齒輪、六角頭螺栓、蜂窩鏤空板、插入緊固件…
- `src/components/Viewport.tsx` / `src/ribbon.ts` — CAD／世界 **座標** (HK), 用戶座標系、座標構造點、關節座標幀; keep **極坐標** polar pins

### 2. Fusion UI micro-polish (CSS-only)
`src/index.css` — FISHING47 after FISHING46:
- `.sketch-bar` gap/padding; buttons min-height 28px / radius 6px
- `.ribbon-tabs` / `.ribbon-tab` letter-spacing
- `.status-bar` min-height 26px; `.status-msg` rhythm
- `.cmd-palette-head` / `.panel-label` breathing
- **No** `data-cmd` / `data-testid` changes

### 3. i18n TC aliases
`src/i18n.ts` — 用戶座標系 / 座標構造點 / 關節座標幀 / 世界座標 / CAD 座標

## Tests
- fishing47 Formal+CSS — **7 PASS**
- fishing46 / fishing45 Formal + more28 prep — **PASS 0 skip** (99 total suite)
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~18:45 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-184448` |
| Bundle | `index-hDyLSXmm-r2.js` |
| MD5 | `d543192a7d2b08f9fe8262b54b35ba5f` |
| Prev (bak) | `index-BwqqsU43-r2.js` / `v2.20-20261016-183634` **kept** |
| Assets | 89 uploaded; index asset refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing47-sc-leftovers-fusion-css` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Formal TC applied (batch): **~118** UV (WindTunnel priority)
- CSS polish rules: **8**
