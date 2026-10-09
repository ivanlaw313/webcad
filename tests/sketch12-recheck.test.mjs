// SKETCH12 re-check (live index-Cbf7Xskc-)：偏移方向跟游標所在側（單線／開放折線／矩形，拖動及輸入值）、
// Ø/R 標籤單擊選取雙擊編輯、延伸前方無曲線時專用訊息且不改草圖不推撤銷。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const { useApp, offsetSideAt } = await import('../src/store.ts')
const g = () => useApp.getState()
const settle = (ms = 150) => new Promise((r) => setTimeout(r, ms))
const fresh = (extra = {}) => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchPlane: 'XY', sketchProfiles: [], sketchShape: null, skCons: [], appConfirm: async () => true, ...extra }, true)
const line = { type: 'poly', pts: [[0, 0], [40, 0]], verts: [[0, 0], [40, 0]], bulges: [0], open: true }
const pl = { type: 'poly', pts: [[0, 0], [40, 0], [40, -20]], verts: [[0, 0], [40, 0], [40, -20]], bulges: [0, 0], open: true }
const rect = { type: 'rect', a: [0, -20], b: [40, 0] }
const ys = (sh) => (sh.verts ?? (sh.type === 'rect' ? [sh.a, sh.b] : sh.pts)).map((p) => p[1])

test('offsetSideAt: open line / polyline use the cursor side (was always +); closed = inside/outside', () => {
  for (const sh of [line, pl]) {
    const up = offsetSideAt(sh, [20, 3]), down = offsetSideAt(sh, [20, -3])
    assert.notEqual(up, down, 'opposite sides give opposite signs')
  }
  assert.equal(offsetSideAt(rect, [20, 3]), 1); assert.equal(offsetSideAt(rect, [20, -3]), -1)
})

for (const [name, sh] of [['line', line], ['open polyline', pl], ['rectangle', rect]]) for (const typed of [null, 4]) for (const side of [1, -1]) {
  test(`offset ${name}, ${typed ? 'typed 4' : 'dragged 8'}, cursor ${side > 0 ? 'above' : 'below'} → result on the cursor side`, async () => {
    fresh({ sketchProfiles: [sh] }); g().setSketchTool('offset')
    if (typed) g().setSketchOffsetD(typed)
    await g().skOffsetAt([20, side * 0.3]); g().onSketchMove([20, side * 8]); await g().skOffsetAt([20, side * 8]); await settle()
    const off = g().sketchProfiles.find((x) => x.offsetOf)
    assert.ok(off, g().status)
    const want = typed ?? 8, y = name === 'rectangle' ? Math.max(...ys(off)) : ys(off)[0]
    assert.ok(Math.abs(y - side * want) < 1e-3, `${name}: picked edge moved to ${y}, expected ${side * want}`)
  })
}

test('Extend with nothing ahead: dedicated formal message, no change, no undo step', async () => {
  const W = { type: 'poly', pts: [[40, -20], [40, 20]], verts: [[40, -20], [40, 20]], bulges: [0], open: true }
  fresh({ sketchTool: 'extend', sketchProfiles: [{ ...line, pts: [[0, 0], [20, 0]], verts: [[0, 0], [20, 0]] }, W] })
  const before = JSON.stringify(g().sketchProfiles), u = g().sketchUndo.length
  await g().skExtendAt([1, 0]); await settle()
  assert.equal(g().status, '延伸：此方向沒有可延伸至的曲線')
  assert.equal(JSON.stringify(g().sketchProfiles), before); assert.equal(g().sketchUndo.length, u)
})

test('Dimension labels (Ø / R included): single click selects, double-click opens the input', () => {
  const sl = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  assert.match(sl, /if \(l\.edit!\.dim === 'ext'\) \{ beginEdit\(l\); return \} selectDimLabel\(l\)/)
  assert.match(sl, /onDoubleClick=\{l\.edit && [^\n]*beginEdit\(l\)/)
  assert.match(sl, /sh\.type === 'circle' \|\| \(sh\.type === 'poly' && sh\.arc\) \? \{ kind: 'circle', shape: idx \}/)
})
