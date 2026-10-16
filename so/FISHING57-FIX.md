# FISHING57 — joint Formal 轉動／剛性 + ASSEMBLE 選面配合

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing57-joint-types-formal`  
**Product fix:** `be4218ce24a1d3a70607a6b8149036d44a710617`  
**more36 soft-prep:** **none** (not present)  
**Base:** tip `4c82085` (FISHING56 live)  
**Tip:** `3585a63e582d0d9a36db99602cf026208f801292`

## Scan

| Source | Result |
|---|---|
| F53/F54 recheck | Joint type list showed 「旋轉」; want Formal 「轉動／剛性」; 面貼合 path often unreached |
| Formal chrome | Exhausted (more34 soft=0) — **no Formal UV wave** |
| BOT-D more36 | Absent — skip cherry-pick |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. Joint Formal 「轉動」 (real UX / Formal product label)
- `src/assembly/kinematics.ts` — `JOINT_LABEL_TC.revolute` **旋轉→轉動**; hints 繞軸轉動／…; keeps 「剛性」
- `src/components/BrowserTree.tsx` — joint type chip Formal 轉動
- `src/store.ts` — joint-pick status 預設轉動（was 預設旋轉）
- Aligns with ribbon tip 「轉動關節」 / i18n `轉動` = Revolute; distinguishes from Revolve feature 「旋轉」

### 2. ASSEMBLE 選面配合 (面貼合 reachability)
- `src/ribbon.ts` — **選面配合** (`facemate`) on ASSEMBLE; tip mentions 面貼合／同軸
- `src/store.ts` — `case 'facemate': startFaceMate(false)` (persistent mate; Align stays one-shot)

## Tests
- fishing57 hard — **5 PASS / 0 fail**
- joint-axis-cad-mapping — **4 PASS** (label list updated)
- `tsc -p tsconfig.app.json --noEmit` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server
- more36 — **N/A**

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~20:39 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-203810` |
| Bundle | `index-D4sfc_aM-r2.js` |
| MD5 | `c3224ccdb35d81fb2185279d36cc576f` |
| Prev bak (F56) | `index-Q71nlGol-r2.js` / `v2.20-20261016-202918` **kept** |
| F55 bak | `index-DpcW-155-r2.js` / `v2.20-20261016-202056` **kept** |
| F54 bak | `index-D3IZbGn0-r2.js` / `v2.20-20261016-201034` **kept** |
| F53 bak | `index-aCbC2XoX-r2.js` / `v2.20-20261016-200102` **kept** |
| F52 bak | `index-CtRHOlPv-r2.js` / `v2.20-20261016-194504` **kept** |
| F51 bak | `index-DcxSrmLk-r2.js` / `v2.20-20261016-193000` **kept** |
| Mid bak | `index-CikSa4HM-r2.js` / `v2.20-20261016-192605` **kept** |
| FISHING50 bak | `index-C2stU6yj-r2.js` / `v2.20-20261016-191338` **kept** |
| Assets | 89 uploaded; index+lazy refs curl **200** (0 bad / 34 refs) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing57-joint-types-formal` + FF `fix/sketch-face-copy` → tip (vps + origin); **not** feature/ |

## Counts
- Product: kinematics + BrowserTree + ribbon facemate + store cmd/status
- fishing57 hard: **5 PASS**
- MATERIALS keys unchanged: **yes**
- Formal soft→hard: **N/A**
