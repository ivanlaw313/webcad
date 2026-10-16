# FISHING78 — joint-origin 轉角 + FEA 設定力 Formal

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing78-behavior-ux`  
**Product fix:** `ecbb202`  
**more41 soft-prep:** **none** (absent — defer F79)  
**Base:** tip `4b5626f` (FISHING77 live)  
**Tip:** (after FF docs — see remotes)

## Scan

| Source | Result |
|---|---|
| F55–F77 Formal typos | 復用/連接/件心 user strings cleared; leftover **旋轉角度** on joint-origin ∠ control |
| FEA tips | Armed hint 「+ **設力**」 abbreviated |
| 旋轉 feature | Kept （實體旋轉） |
| more41 | Absent |
| MATERIALS / DENSITY_PREF | SC kept |

## Fixes

### 1. Joint-origin angle Formal 轉角
- JointsPanel: tip `繞原點 Z 軸轉角`；label/title `轉角（°）` / `關節原點繞 Z 軸轉角`

### 2. FEA tip 設定力
- Prestressed modal + generative design armed hints `設力` → `設定力`

## Tests
- fishing78 hard — **3 PASS**
- fishing77 — **3 PASS**
- `tsc` — EXIT:0
- more41 — **N/A**

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:44 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-224157` |
| Bundle | `index-JLbPp9k6-r2.js` |
| MD5 | `9c39fd91bff801c8af9357d466d10b9e` |
| Prev bak (F77) | `index-qqf_5Ak9-r2.js` / `v2.20-20261016-223644` **kept** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing78-behavior-ux` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing78 hard: **3 PASS**
- more41 cherry: **no**
- MATERIALS keys unchanged: **yes**
