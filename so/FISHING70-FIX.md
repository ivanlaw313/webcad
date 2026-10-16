# FISHING70 — Formal 控製→控制 (drivejoints / Form / editpoles / bspline)

**Date:** 2026-10-16 (HK)  
**Branch:** `fix/fishing70-behavior-ux`  
**Product fix:** `e7998a5` (`e7998a5`)  
**more40 soft-prep:** **none** (absent — defer F71)  
**Base:** tip `9586e5c` (FISHING69 live)  
**Tip:** (after FF docs — see remotes)

## Scan (prefer REAL P1/P2 — NOT tip Formal fill)

| Source | Result |
|---|---|
| F55–F69 rechecks | Tip Formal catalog fill exhausted (F68: 0 mismatches). F69 運動連結 + tip.jointorigin cleared. |
| F66 recheck sample | 「播放**控製**驅動裝配」— wrong glyph 製 (Formal = **控制**) |
| F61 plane-clarify | PARTIAL remains (box face alone → component select; mixed cyl↔planar clarify only after type needs axis) — **deferred** (not cheap wrong-string) |
| CORE16 / unit | Prior waves 101/101; no new open CORE16 behavior fail in F55–F69 notes |
| SC leftovers | UI priority flat; MATERIALS / DENSITY_PREF SC **kept** |
| tip Formal invent | **Not done** — only concrete 控製 typo |
| BOT-D more40 | Absent — skip cherry-pick → F71 |

## Fixes

### 1. Formal zh-HK 「控製」→「控制」
- `tip.drivejoints` + ribbon `drivejoints` tip: 播放**控制**驅動裝配
- Form tips (formcyl/formplane/formsphere/formtorus): 控制籠／控制點
- editpoles / formsubdiv / sk_bspline tips: 控制點／控制籠
- 15 occurrences across ribbon.ts + zh-HK.ts; zero `控製` left in product (excl. zh-CN)

## Tests
- fishing70 hard — **3 PASS / 0 fail**
- fishing69 hard — **3 PASS**
- `tsc` (flock) — clean EXIT:0
- more40 — **N/A**
- Node `/home/box/.local/node/node-v22.19.0-linux-x64/bin` · nice -n 19 · **NO** dev server / browser

## Deploy

| Field | Value |
|---|---|
| When (HKT) | 2026-10-16 ~22:02 |
| APP_VERSION | **2.20** |
| Stamp | `v2.20-20261016-215940` |
| Bundle | `index-QQGNjijq-r2.js` |
| MD5 | `9a7a4aab3876b7ecf5bc5d2d0d442d5e` |
| Prev bak (F69) | `index-BehrEApg-r2.js` / `v2.20-20261016-215415` **kept** |
| F68–F50 baks | prior stamps **kept** |
| Assets | 89 uploaded; refs curl **200** (34) |
| Live | https://cad.neuralworkshk.com/ |
| Remotes | `fix/fishing70-behavior-ux` + FF `fix/sketch-face-copy` → tip (vps + origin) |

## Counts
- fishing70 hard: **3 PASS**
- more40 cherry: **no**
- MATERIALS keys unchanged: **yes**
