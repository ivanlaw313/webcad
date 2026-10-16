# FISHING60 — Formal leftover 匯出／檔案／設定 + P1 關節 tip + more37

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing60-import-formal-leftovers`  
**Product Formal:** `752edb1` (導出→匯出 / 文件→檔案 / 設置→設定)  
**more37 cherry:** `2560f88` ← `127b65a` on `test/unit-core16-more37` (cherry-pick -x)  
**P1 關節 tip/status:** `7b38d98` (tip.joint 轉動; kindLbl 轉動／滑動關節; faceMate status 面貼合)  
**Base:** tip `70f5596` (FISHING59 live)  
**Tip:** `553eee0cd202bbe33a84a404ba7072cd69f5207d`

## Scan

| Source | Result |
|---|---|
| F52–F59 Formal leftovers | ParamsPanel／Drawing／Viewport／Tree／Ribbon／AiCopilot／store／3MF／propsReport／aeroI18n 導出／文件／設置 |
| F57 recheck P1 | ASSEMBLE 關節 tip still 旋轉/滑動/剛性 → **轉動**; pick status 旋轉／滑動關節 → **轉動**; optional status 選面配合→**面貼合** |
| BOT-D more37 | **READY** `127b65a` — cherry into this wave |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. Formal leftover 導出→匯出 / 文件→檔案 / 設置→設定
- ParamsPanel — 匯出變體／全部配置／STL
- DrawingPanel — 匯出 PNG／DXF；貼檔案
- Viewport／BrowserTree／Ribbon — 檔案單位／貼檔案
- AiCopilot — 設定（供應商…）
- store — 檔案預設密度／空白檔案／匯出 STEP／設定齒輪；3MF／propsReport／aeroI18n／tools Formal

### 2. P1 ASSEMBLE 關節 tip／拾取 (F57 recheck)
- `src/i18n/locales/zh-HK.ts` tip.joint — **轉動/滑動/剛性**
- `src/store.ts` joint pick cyl kindLbl — **轉動／滑動關節**
- `src/store.ts` startFaceMate status header — **面貼合**（optional polish）

### 3. more37 CORE16 behavior sample
- Cherry `127b65a` → `2560f88` (`tests/core16-more37-behavior-sample.test.mjs`)
- Themes: MATERIALS＋F58 匯入 · box/cyl/cone 0 · fillet/hole/pattern · extrude through-cut · chamfer dist2=0 · thicken · timeline-chip

## Tests
- fishing60 hard — **8 PASS / 0 fail**
- more37 — **11 PASS / 0 fail**
- `tsc` (flock) — clean
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:02 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-210047` |
| Bundle | `index-Dy3uJ3hw-r2.js` |
| MD5 | `068bd0f72b689f439ff9102578ff3ed1` |
| Prev bak (Formal-only mid) | `index-C02fj7wI-r2.js` / `v2.20-20261016-205656` **kept** |
| F59 bak | `index-BGof85ue-r2.js` / `v2.20-20261016-205130` **kept** |
| F58 bak | `index-DXBtrT46-r2.js` / `v2.20-20261016-204611` **kept** |
| F57 bak | `index-D4sfc_aM-r2.js` / `v2.20-20261016-203810` **kept** |
| F56–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** (0 bad / 34 refs) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing60-import-formal-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing60 hard: **8 PASS**
- more37 cherry: **yes** (`127b65a` → `2560f88`)
- MATERIALS keys unchanged: **yes**
- Note: first nginx land `C02fj7wI`/`205656` was Formal-only; final live includes more37+P1 on `Dy3uJ3hw`/`210047`
