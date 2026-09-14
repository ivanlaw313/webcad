# V125 FIX PLAN — Component Boolean tool-pick completable + bake chip

**Ship:** APP_VERSION **1.25** · Grok直改 · NO CloudAgent  
**Date:** 2026-09-14

## Fail from v1.24 solid bot

- Component Boolean cut **stalled** on “pick tool component”; never completed → never showed status-bar 「烘焙为零件实体」.
- MeshFit chip on Fillet/Shell OK; classic BX02 PASS.

## Root causes

1. **Checkbox ≠ pick:** BrowserTree checkboxes only toggle `checkedComps` — testers who “勾选” the tool never finish the op.
2. **`selectComponentBody` clears `compBoolPending`** without calling `componentBoolean` (multi-body tool click cancels).
3. **Toggle-deselect / empty click** on source or canvas calls `selectComponent(null)` → silently clears pending.
4. Status text only said “点击第二个零件” — no list / checkbox / Esc docs.

## Fixes

1. Canonical `pickComponentBooleanTool(toolId, bodyId?)` + `cancelComponentBoolean()`.
2. `selectComponent` / `selectComponentBody` / `toggleCheckComp`: when pending + **other** component → finish; same/null → **keep** pending (remind), do not silent-cancel.
3. Viewport `CompBoolPickPanel`: button list of other mesh components + Cancel; Esc cancels.
4. BrowserTree / Viewport: while pending, do not toggle-to-null; body click finishes.
5. Clearer status: Browser name / viewport / checkbox / list.
6. Keep v1.24 `statusAction` 「烘焙为零件实体」 after successful boolean (atomic set).
7. Contract test `tests/grok-qa-v1.25-compbool-pick.test.mjs`.

## Process

1. Plan (this file) → implement → test → APP_VERSION 1.25  
2. PR merge deploy → DEPLOY-RESULT-v1.25 + copy to `/workspace/webcad-qa/out/`
