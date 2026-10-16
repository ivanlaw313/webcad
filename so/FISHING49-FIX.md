# FISHING49 — Residual UV Formal TC + Fusion CSS

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing49-sc-leftovers-fusion-css`  
**Product fix:** `981ca9b3a2da76488ba3514d516a37ecda699e3e`  
**Base:** tip `bc5e24f` (FISHING48 live; product = `fix/sketch-face-copy`)  
**Tip:** _(updated by tip-align docs commit)_

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–48 | **No new open P1** product bugs (recheck P1s = QA path / not-committed; Assemble closed FISHING39) |
| Residual SC after FISHING48 | priority UV ~105 hits; many MATERIALS keys (keep SC) + template FPs; **~40+ real UV** converted |
| Prefer: residual SC-LEFTOVERS + CSS polish | **Converted** measure/sketch/joint/CAM/Form/worker UV; **CSS-only** marking-menu/feat-editor/cs-btn |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF from bc5e24f → this tip |

## Fixes

### 1. Formal TC — residual UV (product)
- `src/store.ts` — sketch typed (豎直／邊長／掃角／半軸／充滿度); partSolid 圓角／抽殼／面圓角; joint 轉動／剛性／滑動／圓柱; measure 圓稜／弧稜／直稜／環面／弧長／過孔(間隙); CAM 輪廓／面銑／鑽孔; face-mate 同軸／貼平／翻轉／間隙; AI （無回應）／（無實體）; 本體／姿態／Z 軸／構造軸
- `src/worker/cad.worker.ts` — applyTargetDeltas **鏡像**; multi-face tag **該面**
- `src/components/Viewport.tsx` — Form tStatus **點**／**縮**／**點）**
- `src/components/WindTunnelGpu.tsx` / SketchLayer / BrowserTree / SlicePanel / CurvatureOverlay / WindPoseCompare / kinematics — residual Formal samples
- **Kept** MATERIALS / DENSITY_PREF SC storage keys (`钢`/`铝`/…)

### 2. Fusion UI micro-polish (CSS-only)
`src/index.css` — FISHING49 after FISHING48:
- `.mm-label` / `.mm-item` marking-menu rhythm
- `.feat-editor .fe-title` / `.fe-close` / `.fe-del`
- `.toast` / `.cs-btn` breathing
- `.browser-head` padding
- **No** `data-cmd` / `data-testid` changes

### 3. i18n TC aliases
`src/i18n.ts` — 豎直／邊長／圓稜／弧長／點）／縮／本體／姿態 …

## Tests
- fishing49 Formal+CSS — **8 PASS**
- fishing48 harden + fishing47/46/45 Formal — **116 PASS / 0 skip / 0 fail**
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~19:08 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-190556` |
| Bundle | `index-CRoGjZJt-r2.js` |
| MD5 | `53cd2ce2a2fb852f460e55f51ff24f80` |
| Prev (bak) | `index-Bo6Ktuem-r2.js` / `v2.20-20261016-185553` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing49-sc-leftovers-fusion-css` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Formal TC UV applied (batch): **~40+** intentional (139 token ops incl. broader 周長／面積／構造軸)
- CSS polish rules: **7**
- MATERIALS keys unchanged: **yes**
