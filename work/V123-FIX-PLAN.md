# V123 FIX PLAN — Component-Boolean UX + Shell keep-solid

**Ship:** APP_VERSION **1.23** · Grok直改 · NO CloudAgent  
**Date:** 2026-09-14

## Context (V122 retest)

After **assembly / component Boolean** (mesh-level), Fillet / Shell toast `先要有实体` with no recovery path. Testers miss that:

- Component Boolean → mesh occurrence only (not part timeline B-rep)
- Fillet / Shell / 面圆角 need `hasSolid(features)` on the **part** timeline
- Recovery: MeshFit/转 B-rep → (✎ edit-in-place if def-backed) / or use **实体布尔** on part bodies

## P0 — Component Boolean dead-end UX (must ship)

1. **Guided status** when Fillet / Chamfer / Shell / FaceFillet (and related solid cmds that still say bare `先要有实体`) fire without part solid:
   - If mesh component(s) present: explain mesh vs part solid; point to **MeshFit/转 B-rep**, **✎编辑** when `src` exists, and **实体布尔** for part-timeline multi-body.
   - Else: keep short “先建零件实体（拉伸/旋转…）”.
2. **Post-boolean bake offer** (easy path): after successful `componentBoolean`, `appConfirm` to bake result into active part solid via `convertMeshComponent` + if timeline still empty, `editComponent` so Fillet/Shell can run immediately.
3. i18n EN keys for new status strings.

## P1 — Shell OCCT

- Keep pushing OCCT; **do not regress** v1.22 copy-heal + alternate planar openings.
- Ensure alternate-planar-open path still produces a solid (volume > 0); soft wording stays.
- Stretch only — do not block ship on hard OCCT win.

## P2 — Nice (timebox)

- Sketch A01 small reliability only if leftover time; **do not block** on A01–A10 suite.

## Process

1. Plan (this file)
2. Implement + contract/runtime tests `tests/grok-qa-v1.23-*.mjs`
3. `APP_VERSION = '1.23'`
4. PR → merge → deploy → `DEPLOY-RESULT-v1.23.md` + brief FINAL

## Acceptance

- [x] Fillet/Shell without part solid + with mesh comps → guided status (not bare `先要有实体`)
- [x] After component boolean success → optional bake confirm wiring present
- [x] APP_VERSION 1.23; prior shell copy-heal / alt openings tests still green
- [x] Deployed; DEPLOY-RESULT recorded
