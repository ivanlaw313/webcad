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
