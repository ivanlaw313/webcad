// Fusion semantics: Sketch Text 字高 = capital-letter height (cap height), not the font em.
// Roboto's cap height is 1456/2048 ≈ 0.711 em, so the old em mapping drew 10 mm 字高 as ~7.1 mm capitals.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const opentype = require('opentype.js')
const { textToSketchShapes, capHeightRatio, emSizeForCapHeight } = await import('../src/sketch/textShapes.ts')

const buf = fs.readFileSync(new URL('../src/fonts/Roboto-Regular.ttf', import.meta.url))
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const bbox = (shapes) => {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const s of shapes) for (const [x, y] of s.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  return { w: x1 - x0, h: y1 - y0, y0, y1 }
}

test('Roboto cap-height ratio comes from the font metrics', () => {
  const r = capHeightRatio(font)
  assert.ok(Math.abs(r - 1456 / 2048) < 1e-9, `ratio ${r}`)
  assert.ok(Math.abs(emSizeForCapHeight(font, 10) - 10 / r) < 1e-9)
})

for (const [text, size] of [['H', 10], ['HELL', 10], ['WEBKIT', 12], ['E', 2.5]]) {
  // flat-topped capitals only: round letters (O, C, S) overshoot the cap line by ~2–3 % by design
  test(`字高 ${size} mm → "${text}" capitals are ${size} mm tall (bbox)`, () => {
    const b = bbox(textToSketchShapes(text, { size, pos: [0, 0], font }))
    assert.ok(Math.abs(b.h - size) < size * 0.01 + 0.02, `capital height ${b.h} for 字高 ${size}`)
    assert.ok(Math.abs(b.y0) < size * 0.01 + 0.02, `capitals sit on the baseline (y0=${b.y0})`)
  })
}

test('cap-height mapping scales width too (glyph proportions unchanged) and em mode keeps the old size', () => {
  const cap = bbox(textToSketchShapes('HELL', { size: 10, pos: [0, 0], font }))
  const em = bbox(textToSketchShapes('HELL', { size: 10, pos: [0, 0], font, heightMode: 'em' }))
  assert.ok(Math.abs(em.h - 7.109375) < 0.05, `em mode height ${em.h}`)
  assert.ok(Math.abs(cap.w / em.w - 2048 / 1456) < 0.01, 'uniform scale')
  // spacing path also uses the cap-height em size
  const spaced = bbox(textToSketchShapes('HI', { size: 10, pos: [0, 0], font, spacing: 1 }))
  assert.ok(Math.abs(spaced.h - 10) < 0.12, `spaced height ${spaced.h}`)
})

test('a font without OS/2 metrics measures H; a bare provider keeps em semantics', () => {
  const noMetrics = { getPath: (t, x, y, s) => font.getPath(t, x, y, s) }
  assert.ok(Math.abs(capHeightRatio(noMetrics) - 1456 / 2048) < 0.01)
  const provider = (t, s) => font.getPath(t, 0, 0, s).commands
  assert.ok(Math.abs(bbox(textToSketchShapes('H', { size: 10, pos: [0, 0], provider })).h - 7.109375) < 0.05)
  assert.ok(Math.abs(bbox(textToSketchShapes('H', { size: 10, pos: [0, 0], provider, capRatio: 1456 / 2048 })).h - 10) < 0.05)
})

test('3D sketch-text feature: new features carry sizeMode cap; the worker converts only those (old files unchanged)', () => {
  const store = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const at = store.indexOf('  commitSkTextDlg: async () => {'), commit = store.slice(at, store.indexOf('  copySketchDiag:', at))
  assert.match(commit, /type: 'text', text: txt, size, sizeMode: 'cap'/)
  const worker = fs.readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  assert.ok(worker.includes("f.sizeMode === 'cap' ? emSizeForCapHeight(getFont('cad') as unknown as GlyphFontLike, f.size || 12) : (f.size || 12)"))
  assert.match(worker, /textToSketchShapes\(text \|\| 'TEXT', \{ size: Math\.max\(2, size \|\| 12\), pos: \[0, 0\], align: 'center', font:/)
})
