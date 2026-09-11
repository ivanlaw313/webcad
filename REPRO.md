# SIM stale invalidation (BUG-BD-010 / BUG-BD-011)

## Case
Handoff P1「SIM 約束失效標示」— Fixed→Roller or geometry change must mark old FEA results 失效; must not show old colormap as current.

## Root cause
1. `setFeaOpt` was a passthrough (`set(p)`), so Fixed→Roller left `feaResult` live and `FeaOverlay` kept painting the old cloud.
2. Clearing the fixed-face chip only nulled `feaFixed` and left `feaResult`.
3. `bodyMesh` updates (feature rebuild / length edit) never invalidated FEA/mold/wind overlays or set an explicit 失效 status (BUG-BD-011).

## Fix
- `src/simulation/resultValidity.ts` — pure helper: physics-opt detection + invalidate patch (`feaStale` + clear overlays + 失效 status).
- Store: `setFeaOpt` invalidates on physics BC changes; `clearFeaFixed` / `clearFeaLoad`; `bodyMesh` subscribe; successful solve clears `feaStale`.
- Viewport: chips call clear helpers; FEA panel shows ⚠ 結果已失效 banner.

## Tests
```bash
node --experimental-strip-types --import ./tests/register-resolver.mjs --test \
  tests/sim-result-validity.test.mjs tests/sim-stale-invalidation.test.mjs
npm run test:commercial-core
npm run build
```

---

# DR002 / DR005 — drawing scale & annotation drag

## Cases
- BUG-DR-002 / handoff DR002: scale selector 1:1 / 1:2 did not change on-screen or export paper size (views stayed `width:100%; height:200`).
- BUG-DR-005 / handoff DR005: manual linear/radial labels could not be dragged apart; Esc did not restore a mid-drag move.

## Root cause
1. Scale was title-block text only. Screen SVGs used a fixed CSS box, so 1:1 and 1:2 hashed identical.
2. Manual dims had no `offset` / `angle` fields and no pointer-drag handlers; overlapping labels could not be re-laid out.
3. A naïve Esc listener on `document` (bubble) lost to capture-phase App Esc layers, and listeners on the moving `<text>` could detach across React re-renders.

## Fix
- `drawingScale` / `paperViewSizeMm` drive real paper mm for on-screen views and export (`scale(k)` / width×k).
- `DMDim.offset` / `DRDim.angle` persist in `drawingAnno` (save/reload + regenerate keep associations in paper space).
- Drag writes offset/angle live; pointerup keeps them; Esc / pointercancel restores a `cloneDrawingAnno` snapshot via `registerEscapeLayer` (priority 1000); move listeners on `window`.

## Verify
```bash
node --experimental-strip-types --import ./tests/register-resolver.mjs --test \
  tests/drawing-layout.test.mjs
pnpm run test:commercial-core
pnpm run build
```

Manual: open Drawing → switch 1:1 / 1:2 and confirm view boxes change size; place a linear/R dim → drag label → release (persists) → drag again → Esc (restores); edit model and regenerate — auto dims follow, manual offsets survive in paper space.

---

# UI001 / DR004 — small viewport toolbar & drawing crop

## Cases
- BUG-UI-001 / handoff UI001: Chrome zoom 125%/150%/200% and windows 800×600 / 390×600 clip panels & toolbars; Confirm/Cancel/numeric fields hard to reach.
- BUG-DR-004 / handoff DR004: engineering-drawing annotation toolbar horizontally cropped; overlay intercepts clicks.

## Root cause
1. `body { overflow: hidden }` + vertically centered `.drawing-overlay` clipped tall drawing modals; backdrop `onClick={close}` closed the panel when clicks missed the modal box.
2. `.dw-foot` stayed a single wide row: `inline-flex` tool groups (`flex-shrink: 0`, no wrap) were wider than the modal, so the annotation/numeric controls were horizontally cropped (or only reachable by scrolling the whole modal sideways).
3. At Chrome zoom / short CSS viewports, `.cmd-palette` kept a large `top` offset so Confirm/Cancel could sit below the visible area even though the foot is `flex-shrink: 0`.

## Fix
- Drawing overlay: top-aligned + `overflow: auto`; close only when `event.target === currentTarget`.
- Drawing modal: column flex; scrollable `.dw-body`; sticky-width `.dw-foot` with `flex-wrap` + `overflow-x: auto`; `.dw-tool-group` wraps.
- Command palette / navbar: tighter `top`/`max-height` under `max-height: 640px` and `max-width: 800px`.

## Verify
```bash
node --experimental-strip-types --import ./tests/register-resolver.mjs --test \
  tests/small-viewport-layout-contract.test.mjs \
  tests/fusion-visual-layout-contract.test.mjs \
  tests/sketch-toolbar-layout-contract.test.mjs \
  tests/modal-layering-contract.test.mjs
pnpm run test:commercial-core
pnpm run build
```

Manual: open Drawing, resize to 800×600 and 390×600, set Chrome zoom 125/150/200%; Confirm/Cancel + drawing numeric fields stay visible/clickable; annotation toolbar wraps or scrolls; drawing not clipped into an unusable state.
