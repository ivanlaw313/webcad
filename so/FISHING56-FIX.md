# FISHING56 — moldflow Formal TC 着色→著色 + more35 CORE16

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing56-moldflow-zhuse-formal`  
**Product fix:** `93348ac2e20983dd8859741e45b73aa0b48c4b7d`  
**more35 soft-prep:** `e3761ebe99b1f8e4fec415f8873b367a811e7a2c` (cherry-pick `2eb3ce2`; Formal soft pins **0** — CORE16 behavior sample 11/11 already-hard)  
**Base:** tip `659e894` (FISHING55 live)  
**Tip:** `1cfb49792384e08207e17877a1249835e3784a22`

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–55 | F53 recheck P1 @aCbC2XoX: moldflow UI 「趨勢着色」（着，非 著） |
| Prefer: real P1/P2 | **Formal TC product string** in moldflow/analysis UI (not Formal-only chrome wave) |
| BOT-D more35 | Ready `2eb3ce2` / `unit/more35-soft-prep.md` — CORE16 11/11 soft-prep, Formal soft **0** — cherry-pick tests only |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF → this tip |

## Fixes

### 1. Moldflow / analysis 「着色」→「著色」 (P1)
- `src/components/Viewport.tsx` — moldflow dialog summary **趨勢著色（非商用模流精度）**; wind surface label; draft gradient label; RT/G-code titles
- `src/store.ts` — FEA/moldflow status **體素趨勢著色**; draft gradient / wireframe / split-face / RT user status
- `src/ribbon.ts` — FEA tip + draft tip + splitface tip Formal 著色

### 2. 檢查擴展 measureedge tip (quick UX)
- `src/ribbon.ts` — tip surfaces **圓稜／弧稜** Ø/R/弧長（F53 unreached path）

### 3. more35 CORE16 sample (tests only)
Cherry-pick BOT-D `2eb3ce2` → `tests/core16-more35-behavior-sample.test.mjs` (copy/combine/shell→fillet/split/pattern/csink/move cancel/emboss refuse/undo + MATERIALS/F54 always-hard). **No Formal UV wave.** Soft pins already hard — no harden needed.

## Tests
- fishing56 hard — **5 PASS / 0 fail**
- more35 CORE16 behavior sample — **11 PASS / 0 skip**
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~20:31 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-202918` |
| Bundle | `index-Q71nlGol-r2.js` |
| MD5 | `e8d5ae46cbbbd794d6ff19dfac9975db` |
| Prev bak (F55) | `index-DpcW-155-r2.js` / `v2.20-20261016-202056` **kept** |
| F54 bak | `index-D3IZbGn0-r2.js` / `v2.20-20261016-201034` **kept** |
| F53 bak | `index-aCbC2XoX-r2.js` / `v2.20-20261016-200102` **kept** |
| F52 bak | `index-CtRHOlPv-r2.js` / `v2.20-20261016-194504` **kept** |
| F51 bak | `index-DcxSrmLk-r2.js` / `v2.20-20261016-193000` **kept** |
| Mid bak | `index-CikSa4HM-r2.js` / `v2.20-20261016-192605` **kept** |
| FISHING50 bak | `index-C2stU6yj-r2.js` / `v2.20-20261016-191338` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad / 34 refs) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing56-moldflow-zhuse-formal` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Product line ops: Viewport/store/ribbon 着色→著色 + measureedge tip
- fishing56 hard: **5 PASS**
- more35 CORE16: **11 PASS**
- MATERIALS keys unchanged: **yes**
- Formal soft→hard: **N/A** (0 soft pins; no Formal wave)
