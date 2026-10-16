# FISHING63 — ParamsPanel 匯入設計表 always + tip.* catalog sync

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing63-tip-catalog-sync`  
**Product fix:** `be241f5`  
**more39 soft-prep:** **none** (not present — defer F64)  
**Base:** tip `f100cd3` (FISHING62 live)  
**Tip:** `254eb478b68e377de1bda1a698267f766e4d1a9f`

## Scan

| Source | Result |
|---|---|
| F59 recheck PARTIAL | 進階 details empty when `params.length===0` — 匯入設計表 gated away |
| tip.* vs ribbon | 9 stale catalog tips shorter than ribbon (combine/mirror/thicken/…) — same class as tip.align |
| BOT-D more39 | Absent — skip cherry-pick |
| tip.align / tip.joint | Already Formal (F62/F60) |
| MATERIALS / DENSITY_PREF | SC kept |
| Product branch | **`fix/sketch-face-copy`** (not feature/) |

## Fixes

### 1. ParamsPanel 匯入設計表 always in 進階
- Ungate 📤設計表CSV / 📥匯入設計表 (not behind `params.length > 0`)
- Empty-state hint when no ƒx params yet
- `data-testid="params-import-design-table"`

### 2. tip.* catalog sync from ribbon.ts (zh-HK)
- circpattern / coil / combine / cone / loft / mirror / profile / thicken / worm

## Tests
- fishing63 hard — **3 PASS / 0 fail**
- `tsc` (flock) — clean
- more39 — **N/A**
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~21:23 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-212138` |
| Bundle | `index-J7GUjhrT-r2.js` |
| MD5 | `2689ad570759677c94412fdb541632ce` |
| Prev bak (F62) | `index-KqyjsbdE-r2.js` / `v2.20-20261016-211548` **kept** |
| F62align–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing63-tip-catalog-sync` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing63 hard: **3 PASS**
- more39 cherry: **no**
- MATERIALS keys unchanged: **yes**
