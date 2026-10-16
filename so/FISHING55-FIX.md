# FISHING55 — DXF/SVG chooser mount + 檢查擴展 zebra/access

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing55-dxf-chooser-inspect-ext`  
**Product fix:** `57badd764b573508331955b2267f62d24b3f2e20`  
**more34 soft-prep:** `5f907fed4a4374c7d576b88f805f8c161a7845e8` (cherry-pick `2da0543`; Formal soft pins **0** — CORE16 behavior sample only)  
**Base:** tip `3e96162` (FISHING54 live)  
**Tip:** `944f5cbe4ef94136ef79f368c03ee89845aece9b`

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–54 | **No new open P1** product crash bugs (F54 PASS @D3IZbGn0) |
| Prefer: real P1/P2 | **UX polish** from F52 recheck: 匯入DXF chooser silent-fail; 斑馬紋／脫模可達性 absent from 檢查擴展 |
| BOT-D more34 | Ready `2da0543` — Formal chrome exhausted; CORE16 sample 8/8 — cherry-pick tests only (no Formal harden) |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF → this tip |

## Fixes

### 1. DXF / SVG file chooser mount (real UX)
- `src/store.ts` — `openDxfDialog` / `openSvgDialog`: mount hidden `<input type=file>` on `document.body` (parity with `openProject` / `openStepComponentDialog`), cleanup on change/cancel. Detached `inp.click()` could silently fail to open the chooser (F52: 匯入DXF click did not open a chooser).

### 2. 檢查擴展 discoverability
- `src/ribbon.ts` — add **斑馬紋** (`zebra`) + **脫模可達性** (`accessanalysis`) to 檢查擴展 (commands already routed in `runCommand`; were only under INSPECT main panel).

### 3. more34 CORE16 sample (tests only)
Cherry-pick BOT-D `2da0543` → `tests/core16-more34-behavior-sample.test.mjs` (volume/refuse integrity + MATERIALS/F54 always-hard). **No Formal UV wave.**

## Tests
- fishing55 hard — **5 PASS / 0 fail**
- more34 CORE16 behavior sample — **8 PASS / 0 skip**
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~20:23 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-202056` |
| Bundle | `index-DpcW-155-r2.js` |
| MD5 | `63048888ecf435dbd40fcb2559ce3833` |
| Prev bak (F54) | `index-D3IZbGn0-r2.js` / `v2.20-20261016-201034` **kept** |
| F53 bak | `index-aCbC2XoX-r2.js` / `v2.20-20261016-200102` **kept** |
| F52 bak | `index-CtRHOlPv-r2.js` / `v2.20-20261016-194504` **kept** |
| F51 bak | `index-DcxSrmLk-r2.js` / `v2.20-20261016-193000` **kept** |
| Mid bak | `index-CikSa4HM-r2.js` / `v2.20-20261016-192605` **kept** |
| FISHING50 bak | `index-C2stU6yj-r2.js` / `v2.20-20261016-191338` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad / 34 refs) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing55-dxf-chooser-inspect-ext` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Product line ops: store chooser mount + ribbon 2 tools
- fishing55 hard: **5 PASS**
- more34 CORE16: **8 PASS**
- MATERIALS keys unchanged: **yes**
- Formal soft→hard: **N/A** (0 soft pins; no Formal wave)
