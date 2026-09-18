# V137 FIX PLAN — Shell success toast proper Chinese (LIVE @1.36 hybrid)

**Ship:** APP_VERSION **1.37** · Grok direct · gh PR · SSH deploy · NO CloudAgent  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.36 (PR #73) — BX01/BX02 Shell CLEAN + no discard; toast still hybrid EN/CN  
**Evidence:** `/workspace/webcad-qa/out/V136-RETEST-FINAL.md` · `/workspace/webcad-qa-solid/out/v136/`

## Symptom (LIVE @1.36)
| Case | Toast (verbatim) |
|------|------------------|
| BX01 Fuse+R2+Shell t=2 | `Done: shell Wall 2 (向内, 开 1 个selected 面, 切线链)` |
| BX02 Cut+R1+Shell t=1.5 | `Done: shell Wall 1.5 (向内, 开 1 个selected 面, 切线链)` |

Solid CLEAN semantics OK; UX ugly. Fillet/Chamfer success similarly mangled under EN (`Done: …倒fillet…`).

## Root cause
1. Status HUD always runs `tStatus(status, lang)`.
2. EN path used **global** `split/join` over short tokens: `已`→`Done: `, `抽壳`→`shell`, `壁厚`→`Wall`, `所选`→`selected `.
3. Source toast was already correct Chinese: `已抽壳 壁厚 2（向内，开 1 个所选面，切线链开）`.
4. Long identity phrases alone cannot protect under global replace (identity is a no-op; shorts still carve inside).

## Fix (v1.37)
1. **`shellSuccessStatus`** (`src/ui/featureStatus.ts`) — single Chinese CLEAN builder; `commitShell` uses it.
2. **STATUS_PHRASES_X guards** — long Chinese identities for shell/fillet/chamfer success units.
3. **`tStatus` → LTR longest-match** — consume longest phrase at cursor so guards actually shield shorts.
4. Contract `tests/grok-qa-v1.37-shell-toast-zh.test.mjs`.
5. `APP_VERSION` → `1.37`; deploy stamp `v1.37-…`.
6. **Do not** touch Shell join budgets (v1.36) or DXF batching (v1.35).

## Acceptance
- [ ] EN tStatus(shell success) matches `/已抽壳 壁厚/` and has no `Done:` / `shell Wall` / `selected`
- [ ] Fillet/Chamfer success similarly Chinese (no `Done:` / bare `fillet` hybrid)
- [ ] CLEAN wording preserved (no 备用/型腔/其他开口)
- [ ] v1.36 shell OOM + v1.35 DXF contracts still PASS
- [ ] LIVE 1.37; solid retest BX01/BX02 toast language + CLEAN
