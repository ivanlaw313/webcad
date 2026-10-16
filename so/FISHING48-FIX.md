# FISHING48 — Harden more29 Formal softs + residual UV

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing48-sc-leftovers-harden`  
**Product fix:** `affa56184d44d5b1a8c78c5860e18be6c9b2e514`  
**Tip:** `64615a1c8db688736f9cac9bc8971f55fe429d91` (`64615a1c8db688736f9cac9bc8971f55fe429d91`)  
**Base:** tip `6861151` (FISHING47 live; product = `fix/sketch-face-copy`)  
**more29:** `fd7da4f` on `test/unit-core16-more29` (79 soft pins) — hardened

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–47 | **No new open P1** product bugs |
| BOT-D more29 @ fd7da4f | 79 soft pins on tip 59b4c75; after FISHING47 ~53 already TC; **26 remaining** soft SC |
| Prefer: clear 26 soft SC + harden more29 | **Converted** all 26 + broader same-token Formal; **CSS** tree/dialog/timeline |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF from 6861151 → this tip |

## Soft SC cleared (exact 26 + 所有棱边)

### store×16
L 型角铁 · 阶梯轴 · 垫圈/环 · 平键 DIN6885 · 已缩放 ×${fac} · MeshFit / 转 B-rep · 锉平面 · 外扩 · 内缩 · 棱台 · 棱锥 · ■ 焊接线 · 云图紫红/橙 · 无明显死腔 · 小齿轮 z${z}

### Viewport×3
CAD 坐標 · ⊞环↔ · ⊞环↕

### AiCopilot×3
关闭 · 供应商 · 。试下：

### Other
SketchLayer 标注 · worker 壳水密 + MakeFillet 构造 · GcodeBackplot 颜色=深度 · scopeOf **所有稜邊** (already TC on tip; kept)

## Fixes

### 1. Formal TC — more29 residual softs (product)
- `src/store.ts` — catalog labels, MeshFit, mold legend, offset/pyramid status, broader comment Formal
- `src/components/Viewport.tsx` / `AiCopilot.tsx` / `SketchLayer.tsx` / `GcodeBackplot.tsx`
- `src/worker/cad.worker.ts` — 殼水密 / MakeFillet 構造
- Broader same-token Formal across product src (excl i18n SC lookup keys)

### 2. Fusion UI micro-polish (CSS-only)
`src/index.css` — FISHING48 after FISHING47:
- `.browser-tree` / `.tree-row` rhythm
- `.feat-dlg .dlg-head` letter-spacing
- `.timeline-bar` / `.inspector .section-title`
- **No** `data-cmd` / `data-testid` changes

### 3. i18n TC aliases
`src/i18n.ts` — 供應商 / 。試下： / ⊞環↔ / ⊞環↕

### 4. Harden more29
`tests/fishing48-sc-leftovers-harden.test.mjs` — from more29 `fishing47-sc-leftovers-formal-prep` soft→hard

## Tests
- fishing48 harden + fishing47/46 Formal — **101 PASS / 0 skip / 0 fail**
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~18:57 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-185553` |
| Bundle | `index-Bo6Ktuem-r2.js` |
| MD5 | `6fa92f2bb2bde72557450a7fb08f9bcb` |
| Prev (bak) | `index-hDyLSXmm-r2.js` / `v2.20-20261016-184448` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing48-sc-leftovers-harden` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Soft SC cleared (exact list): **26** (+ 所有稜邊 already TC)
- more29 soft→hard: **79 → 0 skip** (harden suite PASS)
- CSS polish rules: **4**
