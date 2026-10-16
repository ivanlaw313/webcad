# FISHING54 — Formal TC store leftovers (demo/FEA-mold/params) + CSS

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing54-product-formal-uv`  
**Product fix:** `f86e16b6e0cd10f86ce0f5c9917500beb563b19a`  
**more34 soft-prep:** **none** (no `unit/more34-soft-prep.md`; local `test/unit-core16-more34` = F53 tip `317e38a`, 0 unique commits) — deploy product as-is  
**Base:** tip `317e38a` (FISHING53 live)  
**Tip:** `TIP_PLACEHOLDER`

## Scan

| Source | Result |
|---|---|
| `so/` fishing 35–53 | **No new open P1** product bugs (F53 PASS @aCbC2XoX) |
| Residual after FISHING53 | Store user-facing SC leftovers (demo assembly names / FEA-mold progress / sample params / status) |
| Prefer: BOT-D more34 soft-prep | **Absent** — skip cherry-pick/harden; deploy product Formal only |
| Product branch | **`fix/sketch-face-copy`** (not feature/) — FF → this tip |

## Fixes

### 1. Formal TC — store leftovers
- `src/store.ts` — residual user-facing SC → Formal TC:
  - Assembly demo template names: 太陽輪／內齒圈／行星輪／齒條／內圈／滾珠／連桿／搖桿／大齒輪／小齒輪…
  - FEA / mold progress + report: 體素化／溫度場／算應力／靜力／模態／熱／澆口／結果／假設…
  - Sample `addParam` + `bindParam` sync Formal
  - Interference / pattern / sheetmetal status: manifold 精確布爾／整體翻外／展開圖／收縮×／自定義／取消選／加選／geoSnap 開／關／DXF草圖…
- **Kept** MATERIALS / DENSITY_PREF SC (`material: '钢'`, `DENSITY_PREF = ['钢'…]`)

### 2. SketchLayer freebie
`src/components/SketchLayer.tsx` — comment Formal freebie

### 3. i18n TC aliases
`src/i18n.ts` — FISHING54 Formal TC product UV block (unique keys)

### 4. CSS freebie
`src/index.css` — Fusion-like rhythm freebie

## Tests
- fishing54 Formal hard — **5 PASS / 0 fail / 0 skip**
- more34 soft-prep — **N/A** (not present)
- `tsc` — not re-run (no code change this executor; product commit already built)
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~20:14 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-201034` |
| Bundle | `index-D3IZbGn0-r2.js` |
| MD5 | `8e76971d3860b7cd6a17a41726fd3dc9` |
| Prev bak (F53) | `index-aCbC2XoX-r2.js` / `v2.20-20261016-200102` **kept** |
| F52 bak | `index-CtRHOlPv-r2.js` / `v2.20-20261016-194504` **kept** |
| F51 bak | `index-DcxSrmLk-r2.js` / `v2.20-20261016-193000` **kept** |
| Mid bak | `index-CikSa4HM-r2.js` / `v2.20-20261016-192605` **kept** |
| FISHING50 bak | `index-C2stU6yj-r2.js` / `v2.20-20261016-191338` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad / 34 refs) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing54-product-formal-uv` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Formal TC UV (store): **55** line ops in `store.ts` + SketchLayer 2 + i18n 29 + CSS 6 + test 112
- fishing54 hard tests: **5 PASS**
- MATERIALS keys unchanged: **yes**
- more34 soft→hard: **skipped** (prep absent)
