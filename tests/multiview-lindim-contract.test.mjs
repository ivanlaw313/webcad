/**
 * BUG-UI-001 / BUG-UI-004 — multi-camera viewport layout + drawing linear dims.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const multi = readFileSync(new URL('../src/components/MultiViewPanes.tsx', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')

test('BUG-UI-001: layout menu still offers single/split/quad and mounts live multi-camera panes', () => {
  assert.match(viewport, /viewLayout !== 'single' && <MultiViewPanes layout=\{viewLayout\}/)
  assert.match(viewport, /viewLayout === 'single' && \(/)
  assert.match(viewport, /\(\[\['single', '单一视图'\], \['split', '二视图/)
  assert.match(multi, /export const SPLIT_PANES/)
  assert.match(multi, /export const QUAD_PANES/)
  assert.match(multi, /data-testid="vp-multiview"/)
  assert.match(multi, /data-testid=\{`vp-pane-\$\{view\}`\}/)
  assert.match(multi, /CameraFramer/)
  assert.match(multi, /OrthographicCamera/)
  assert.match(multi, /PerspectiveCamera/)
  // Presets match menu labels: split front/right; quad top/front/right/iso.
  assert.match(multi, /view: 'front'/)
  assert.match(multi, /view: 'right'/)
  assert.match(multi, /view: 'top'/)
  assert.match(multi, /view: 'iso'/)
})

test('BUG-UI-001: CSS grid wires split (2) and quad (4) panes', () => {
  assert.match(css, /\.vp-multiview\s*\{/)
  assert.match(css, /\.vp-multiview-split\s*\{[^}]*grid-template-columns:\s*1fr 1fr/)
  assert.match(css, /\.vp-multiview-quad\s*\{[^}]*grid-template-columns:\s*1fr 1fr[^}]*grid-template-rows:\s*1fr 1fr/)
  assert.match(css, /\.vp-pane\s*\{/)
  assert.match(css, /\.vp-pane-label\s*\{/)
})

test('BUG-UI-004: linear dim picks use full-viewBox hit rect + reject zero-length + Esc cancel', () => {
  assert.match(drawing, /data-testid="dw-hit-rect"/)
  assert.match(drawing, /fill="transparent"/)
  assert.match(drawing, /Distinct second point required/)
  assert.match(drawing, /Math\.hypot\(px - pendPt\.x, py - pendPt\.y\) > 1e-6/)
  assert.match(drawing, /BUG-UI-004: Esc cancels pending pick/)
  assert.match(drawing, /registerEscapeLayer\(\(\) => \{/)
  assert.match(drawing, /if \(pendPt\) \{ setPendPt\(null\); return \}/)
  // Competing modes cleared when entering linear dim (ord/detail stole clicks before).
  assert.match(drawing, /setDimMode\(\(m\) => !m\);[\s\S]*?setDetailMode\(false\); setOrdMode\(false\)/)
  // Endpoint snap improves picks on boxes without holes.
  assert.match(drawing, /for \(const s of segmentsOf\(v\)\)/)
})

test('BUG-UI-001 honesty: preview/orbit banner + empty-state wiring', () => {
  assert.match(multi, /data-testid="vp-multiview-honesty"/)
  assert.match(multi, /预览／环视/)
  assert.match(multi, /vp-pane-empty/)
  assert.match(css, /\.vp-multiview-banner/)
})

test('APP_VERSION stays at 1.14 on current train (release bump separate)', () => {
  assert.match(version, /APP_VERSION = '1\.14'/)
})
