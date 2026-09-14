# V126 FIX PLAN — Ribbon entry for Component Boolean

**Ship:** APP_VERSION **1.26** · Grok直改 · NO CloudAgent  
**Date:** 2026-09-14

## Fail from v1.25 solid bot

- Solid QA cannot find 🧩布尔 — it only lived in the Viewport selection bar when a component is selected (`startComponentBoolean`).
- Testers look for ribbon / Solid Combine.

## Fix

1. Ribbon tool `compboolean` / `组件布尔` on:
   - SOLID → ASSEMBLE (near newcomp / joints)
   - MESH → MODIFY (near meshfit)
   - 🧪實驗室 → 直接编辑扩展 (near 实体布尔)
   - **Not** in Fusion SOLID MODIFY (menu-order contract)
2. `runCommand('compboolean')`: selectedComponent → `startComponentBoolean`; else exactly one mesh component → use it; else status asks to select in Browser.
3. BrowserTree ⋯ menu 「🧩 组件布尔」.
4. Keep CompBoolPickPanel + bake chip.
5. Contract `tests/grok-qa-v1.26-compbool-ribbon.test.mjs`.
6. Critical deploy: verify nginx `root` points at **v1.26** release dir (v1.25 had cases where root stayed on older release).

## Process

Plan → implement → test → APP_VERSION 1.26 → PR merge deploy → DEPLOY-RESULT + `/workspace/webcad-qa/out/V126-*`
