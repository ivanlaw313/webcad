import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('modal overlay stays above the bottom HUD and timeline controls', () => {
  assert.match(css, /\.drawing-overlay\s*\{[^}]*z-index:\s*100/s)
  assert.match(css, /\.vp-navbar\s*\{[^}]*z-index:\s*80/s)
  assert.match(css, /\.timeline\s*\{[^}]*z-index:\s*90/s)
})

test('status messages own their wrapping and readable line height', () => {
  assert.match(viewport, /className="vp-status-message"/)
  assert.match(css, /\.vp-status-message\s*\{[^}]*line-height:\s*1\.7/s)
})

test('build warnings use a viewport-safe width and non-overlapping wrapped lines', () => {
  assert.match(viewport, /className="vp-build-warning"/)
  assert.match(viewport, /className="vp-build-warning-message"/)
  assert.match(css, /\.vp-build-warning\s*\{[^}]*width:\s*min\(360px,\s*calc\(100vw - 24px\)\)/s)
  assert.match(css, /\.vp-build-warning-message\s*\{[^}]*line-height:\s*2[^}]*overflow-wrap:\s*anywhere/s)
})

test('every persisted floating HUD can return to its default dock', () => {
  const drag = readFileSync(new URL('../src/components/useDraggable.ts', import.meta.url), 'utf8')
  const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(drag, /localStorage\.removeItem\(key\)/)
  assert.match(drag, /setPos\(null\)/)
  assert.match(viewport, /navDrag\.reset/)
  assert.match(viewport, /propsDrag\.reset/)
  assert.match(viewport, /statusDrag\.reset/)
  assert.match(timeline, /panelDrag\.reset/)
})

test('dragged HUDs stay reachable after a viewport resize', () => {
  const drag = readFileSync(new URL('../src/components/useDraggable.ts', import.meta.url), 'utf8')
  assert.match(drag, /window\.addEventListener\('resize', clampToViewport\)/)
  assert.match(drag, /window\.removeEventListener\('resize', clampToViewport\)/)
  assert.match(drag, /boundWidth - Math\.min\(r\.width, boundWidth - 4\)/)
})
