# FISHING66 — Assemble tip.* catalog + SOLID tip sync + joint 轉動／滑動關節

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing66-tip-ux-leftovers`  
**Product fix:** `e6cff5a`  
**more40 soft-prep:** **none** (not present — defer F67)  
**Base:** tip `b8b507e` (FISHING65 live)  
**Tip:** `PLACEHOLDER_TIP`

## Scan

| Source | Result |
|---|---|
| Assemble tips | newcomp/compboolean/jointorigin/rigidgroup/motionlink/enablecontact/drivejoints missing from tip.* catalog |
| SOLID tips | box/move/emboss/fillet/pipe/draft/pathpattern catalog shorter than ribbon |
| F60 PARTIAL | startJointPick status lacked contiguous 「轉動／滑動關節」 |
| BOT-D more40 | Absent — skip cherry-pick |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. Assemble tip.* into zh-HK catalog (= ribbon)
- tip.newcomp / compboolean / jointorigin / rigidgroup / motionlink / enablecontact / drivejoints

### 2. SOLID tip.* sync from ribbon
- tip.box / move / emboss / fillet / pipe / draft / pathpattern

### 3. Joint pick status (F60 PARTIAL)
- `store.ts` startJointPick: 「圓柱＝轉動／滑動關節／圓柱」

## Tests
- fishing66 hard — **3 PASS / 0 fail**
- `tsc` (flock) — clean
- more40 — **N/A**
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:41 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-213910` |
| Bundle | `index-CfHqViwc-r2.js` |
| MD5 | `f154017a05b2c382f0d485f5830da341` |
| Prev bak (F65) | `index-CqptExWg-r2.js` / `v2.20-20261016-213409` **kept** |
| F64–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing66-tip-ux-leftovers` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing66 hard: **3 PASS**
- more40 cherry: **no**
- MATERIALS keys unchanged: **yes**
