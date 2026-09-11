/**
 * DR002 / DR005 — paper scale 1:1↔1:2 must change real paper mm size;
 * annotation drag offset/angle must persist; Esc restores the pre-drag snapshot.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  drawingScale,
  paperViewSizeMm,
  drawingLinearOffset,
  cloneDrawingAnno,
  dxfTextValue,
} from '../src/io/drawingLayout.ts'
import { hydrateAnno, EMPTY_ANNO } from '../src/io/drawingAnno.ts'

const panel = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')

test('DR002: paper scale changes real length without changing measured dimension', () => {
  assert.equal(40 * drawingScale('1:2'), 20)
  assert.equal(40 * drawingScale('2:1'), 80)
  assert.equal(drawingScale('0:1'), 1)
  assert.equal(drawingScale('1:1'), 1)
})

test('DR002: paperViewSizeMm halves viewBox extents at 1:2 (and doubles at 2:1)', () => {
  const vb = '0 0 40 30'
  assert.deepEqual(paperViewSizeMm(vb, '1:1'), { width: 40, height: 30 })
  assert.deepEqual(paperViewSizeMm(vb, '1:2'), { width: 20, height: 15 })
  assert.deepEqual(paperViewSizeMm(vb, '2:1'), { width: 80, height: 60 })
  // Invalid / zero ratios fall back to 1:1 so paper never collapses to 0.
  assert.deepEqual(paperViewSizeMm(vb, '0:2'), { width: 40, height: 30 })
})

test('DR002: DrawingPanel wires paperViewSizeMm into on-screen SVG width/height (not fixed 100%/200px)', () => {
  assert.match(panel, /paperViewSizeMm\(d \? d\.vbExp : v\.vb, scale\)\.width/)
  assert.match(panel, /paperViewSizeMm\(d \? d\.vbExp : v\.vb, scale\)\.height/)
  assert.match(panel, /maxWidth:\s*'none'/)
  assert.match(panel, /flexShrink:\s*0/)
  assert.doesNotMatch(panel, /width:\s*'100%',\s*height:\s*200/)
  // Export paths must also apply drawingScale so SVG/PDF paper matches the selector.
  assert.match(panel, /const k = drawingScale\(scale\)/)
  assert.match(panel, /scale\(\$\{k\.toFixed\(4\)\}\)/)
})

test('DR005: linear drag computes perpendicular displacement and leaves endpoints untouched', () => {
  const d = { x1: 0, y1: 0, x2: 30, y2: 40 }
  assert.equal(drawingLinearOffset(d, { x: -8, y: 6 }), 10)
  assert.deepEqual(d, { x1: 0, y1: 0, x2: 30, y2: 40 })
})

test('DR005: drag persists offset/angle on pointerup; Esc restores cloneDrawingAnno snapshot', () => {
  assert.match(panel, /cloneDrawingAnno\(useApp\.getState\(\)\.drawingAnno\)/)
  assert.match(panel, /registerEscapeLayer\(\(\) => finish\(true\),\s*1000\)/)
  assert.match(panel, /finish\(false\)/) // pointerup keeps edits
  assert.match(panel, /finish\(true\)/) // Esc / pointercancel restores
  assert.match(panel, /setDrawingAnno\(before\)/)
  assert.match(panel, /onPointerDown=\{e=>dragAnnotation\(e,v\.name,i,'linear'\)\}/)
  assert.match(panel, /onPointerDown=\{e=>dragAnnotation\(e,v\.name,i,'radial'\)\}/)
  // Listeners on window survive React re-renders of the moving <text>.
  assert.match(panel, /window\.addEventListener\('pointermove',\s*move\)/)
})

test('DR005: cloneDrawingAnno freezes nested dim arrays so Esc cannot see live drag mutations', () => {
  const src = {
    ...EMPTY_ANNO,
    manualDims: { front: [{ x1: 0, y1: 0, x2: 10, y2: 0, offset: 4 }] },
    manualRDims: { front: [{ cx: 1, cy: 2, r: 3, kind: 'r', angle: 0.5 }] },
  }
  const snap = cloneDrawingAnno(src)
  src.manualDims.front[0].offset = 99
  src.manualRDims.front[0].angle = -1
  assert.equal(snap.manualDims.front[0].offset, 4)
  assert.equal(snap.manualRDims.front[0].angle, 0.5)
})

test('DR002/DR005: hydrateAnno keeps scale + drag offset/angle through save/reload (model regen associations)', () => {
  const raw = {
    scale: '1:2',
    manualDims: { front: [{ x1: 0, y1: 0, x2: 40, y2: 0, offset: 12 }] },
    manualRDims: { front: [{ cx: 5, cy: 5, r: 3, kind: 'd', angle: 1.2 }] },
  }
  const h = hydrateAnno(raw)
  assert.equal(h.scale, '1:2')
  assert.equal(h.manualDims.front[0].offset, 12)
  assert.equal(h.manualRDims.front[0].angle, 1.2)
  // Missing keys still default so old saves don't crash the panel.
  const bare = hydrateAnno({})
  assert.equal(bare.scale, '1:1')
  assert.deepEqual(bare.manualDims, {})
})

test('DXF text preserves Chinese and symbols without corrupting group-code lines', () => {
  assert.equal(dxfTextValue('孔 Ø8 ±0.1\n材料'), '\\U+5B54 %%c8 %%p0.1 \\U+6750\\U+6599')
})
