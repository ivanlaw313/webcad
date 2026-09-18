# V134 Fix Plan — Large DXF / schematic import performance & stability

**Ship:** APP_VERSION **1.34** · Grok direct · NO CloudAgent  
**Date:** 2026-09-18 (HKT)  
**Base:** LIVE v1.33 (PR #66) · prior DXF: TEXT retention (v1.21) + sketchOnly default (v1.22)  
**Evidence:** `/workspace/AL1-800A-配电箱.dxf` (~115KB · 116 profiles · 193 TEXT) · `/workspace/webcad-qa-sketch/` · user vote after Shell work

## Note on PR #68
Open PR #68 (`fix/grok-qa-v1.34-assy-file-awsnap`) is **optional** BD-3201 File-after-ASSY hardening (bug CLOSED not_reproduced @1.33). **Do not block** this train. This DXF ship owns **1.34**; leave #68 for later merge/rebase (may become 1.35 additive).

## Root cause / hotspots (profiled)

| Hotspot | Evidence | ROI |
|---------|----------|-----|
| **O(n²) segment chaining** | Disconnected LINE stress: 5k→666ms, 10k→2.5s, **20k→10s** main-thread freeze | **P0** |
| **Mass extrude OOM** (mitigated v1.22) | AL1 full schematic OOM when every profile extruded; soft heuristic `>48` profiles / `>16` texts can still be unchecked | **P0** harden |
| **TEXT construction explosion** | Each TEXT → 2 construction shapes (point+underline); AL1 = 386 shapes; 10k TEXT → 20k Three.js lines | **P1** |
| **Double parse** | `openDxfDialog` parses → `confirmInsertVec` → `importDxf` parses again | **P1** |
| Sync parse / no progress / no cancel | Large files freeze UI with no toast / no Abort | **P1** |
| classifyProfiles O(n²) | AL1 0.7ms; mild until hundreds of nested profiles | P2 |

AL1 parse itself ~15ms after load — freeze/OOM historically from **chain + extrude + shape explosion**, not pair-tokenization.

## Fix (v1.34)

1. **Spatial-hash segment chaining** in `dxfImport.ts` — endpoint grid index → ~O(n) chain (fix 20k disconnected LINEs from ~10s → tens of ms).
2. **Harder sketchOnly defaults + force lock**
   - Soft prefer (default ON): profiles `>32` OR texts `>12` OR bytes `>512KB` (was 48/16).
   - **Force** sketchOnly (checkbox locked): profiles `>200` OR texts `>80` OR bytes `>2MB`.
   - Hard reject with clear toast: bytes `>8MB` or estimated entities `>100k`.
3. **TEXT/MTEXT marker batching** — keep **all** labels in `sketchSources.labels` (HUD); cap construction underline/point markers at **128** with status note.
4. **Parse once** — cache `{profiles,texts,layers,note,skipped,stats}` on `insertVec`; confirm reuses cache.
5. **Progress + cancel** — `busy` + status during parse/import; `dxfImportEpoch` cancel token; dialog Cancel aborts in-flight import.
6. Contract tests `tests/grok-qa-v1.34-dxf-large-import.test.mjs`; keep illegal-UX + Shell v1.28–v1.33 green.
7. `APP_VERSION` → `1.34`; deploy stamp `v1.34-…`; docs under `/workspace/webcad-qa/out/`.

## Acceptance
- [ ] Spatial chain: 20k disconnected LINEs parse ≪ 1s
- [ ] AL1: prefer/force sketchOnly heuristics correct; markers ≤128; labels retained
- [ ] Double-parse eliminated on dialog confirm path
- [ ] Contract suite PASS; Shell v1.28–v1.33 + illegal-UX still PASS
- [ ] LIVE 1.34 verified
