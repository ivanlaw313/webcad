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
