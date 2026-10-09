// selection-multi-delete.test.mjs — Fusion-style selection: sketch Delete removes only the selected edges (P1 data
// loss), plain click replaces / Ctrl·Shift toggles (model + sketch), box-select window/crossing helpers, Q shortcut.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const S = await import('../src/cad/modelSelection.ts')
const D = await import('../src/sketch/deleteSketchEdges.ts')
const { useApp, noteSkClickMod } = await import('../src/store.ts')
const g = () => useApp.getState()
const rectCircle = () => [{ type: 'rect', a: [0, 0], b: [60, 40] }, { type: 'circle', c: [100, 20], r: 10 }]
const seed = (extra = {}) => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'select', sketchProfiles: rectCircle(), skCons: [], appConfirm: async () => true, ...extra }, true)

test('removeContourEdges: rect minus one edge → one open 3-edge polyline', () => {
  const r = D.removeContourEdges({ type: 'rect', a: [0, 0], b: [60, 40] }, [0])
  assert.equal(r.shapes.length, 1)
  assert.deepEqual(r.shapes[0].pts, [[60, 0], [60, 40], [0, 40], [0, 0]])
  assert.equal(r.shapes[0].open, true)
  assert.equal(r.mapRef({ kind: 'edge', shape: 0, idx: 0 }), null)
  assert.deepEqual(r.mapRef({ kind: 'edge', shape: 0, idx: 2 }), { kind: 'edge', shape: 0, idx: 1 })
  const two = D.removeContourEdges({ type: 'rect', a: [0, 0], b: [60, 40] }, [0, 2])
  assert.equal(two.shapes.length, 2, 'opposite edges removed → two separate lines')
  assert.equal(D.removeContourEdges({ type: 'circle', c: [0, 0], r: 5 }, [0]), null, 'circles are not splittable')
})

test('Delete with ONE rect edge selected keeps the rest of the sketch (rect remainder + circle)', async () => {
  seed({ skSel: [{ kind: 'edge', shape: 0, idx: 0 }] })
  await g().skDeleteSel()
  const sh = g().sketchProfiles
  assert.equal(sh.length, 2, g().status)
  assert.ok(sh.some((s) => s.type === 'circle'), 'circle survives')
  const poly = sh.find((s) => s.type === 'poly')
  assert.deepEqual(poly.pts, [[60, 0], [60, 40], [0, 40], [0, 0]])
  assert.equal(poly.open, true)
})

test('sketch click: plain click replaces, Ctrl/Shift click toggles; programmatic calls keep legacy accumulate', () => {
  seed()
  noteSkClickMod('replace'); g().skClickAt([30, 0])
  assert.equal(g().skSel.length, 1, g().status)
  noteSkClickMod('replace'); g().skClickAt([110, 20])
  assert.equal(g().skSel.length, 1, 'plain click on circle replaces the rect edge')
  assert.equal(g().skSel[0].shape, 1)
  noteSkClickMod('toggle'); g().skClickAt([30, 0])
  assert.equal(g().skSel.length, 2, 'Ctrl/Shift adds')
  noteSkClickMod('toggle'); g().skClickAt([30, 0])
  assert.equal(g().skSel.length, 1, 'Ctrl/Shift on a selected entity removes it')
  g().skClickAt([30, 0])
  assert.equal(g().skSel.length, 2, 'no modifier noted (API/tests) → legacy additive')
})

test('model selection: replace vs toggle, merge, clickMod', () => {
  const f = (k) => ({ kind: 'face', key: k, pt: [0, 0, 0], tris: [] })
  let l = S.applySelClick([], f('a'), 'replace')
  l = S.applySelClick(l, f('b'), 'toggle')
  assert.deepEqual(l.map(S.selKey), ['face:a', 'face:b'])
  l = S.applySelClick(l, f('a'), 'toggle')
  assert.deepEqual(l.map(S.selKey), ['face:b'])
  assert.deepEqual(S.applySelClick(l, f('c'), 'replace').map(S.selKey), ['face:c'])
  assert.deepEqual(S.mergeSel([f('a')], [f('a'), f('b')]).map(S.selKey), ['face:a', 'face:b'])
  assert.equal(S.clickMod({ ctrlKey: true }), 'toggle')
  assert.equal(S.clickMod({ shiftKey: true }), 'toggle')
  assert.equal(S.clickMod({ metaKey: true }), 'toggle')
  assert.equal(S.clickMod({}), 'replace')
})

test('model store: modelSelClick accumulates with toggle and clears', () => {
  useApp.setState({ ...useApp.getInitialState(), mode: 'model' }, true)
  const b = (k) => ({ kind: 'body', key: k })
  g().modelSelClick(b('x'), 'replace'); g().modelSelClick(b('y'), 'toggle')
  assert.equal(g().modelSel.length, 2)
  g().modelSelClick(b('z'), 'replace')
  assert.equal(g().modelSel.length, 1)
  g().clearModelSel()
  assert.equal(g().modelSel.length, 0)
})

test('edgeChainAt walks a smooth polyline but stops at corners', () => {
  // square loop corners have degree 2 too → whole loop; add a spur at (1,0,0) → corner stops the walk
  const sq = [0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0]
  assert.deepEqual(S.edgeChainAt(sq, 0), [0, 1, 2, 3])
  // T-junction at (1,0,0): straight line 0→1→2 plus a spur up from x=1 → each piece is its own edge
  const tee = [0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0, 0, 1, 1, 0]
  assert.deepEqual(S.edgeChainAt(tee, 0), [0])
  assert.deepEqual(S.edgeChainAt(tee, 2), [2])
  // smooth open polyline (degree-2 joints) → one chain
  const arc = [0, 0, 0, 1, 0, 0, 1, 0, 0, 2, 1, 0, 2, 1, 0, 3, 3, 0]
  assert.deepEqual(S.edgeChainAt(arc, 1), [0, 1, 2])
  assert.deepEqual(S.edgeChainAt(arc, 9), [])
})

test('box select: window (fully inside) vs crossing (touches) and filter-aware kind', () => {
  const r = { L: 0, T: 0, R: 10, B: 10 }
  assert.equal(S.allInside(r, [1, 1, 9, 9]), true)
  assert.equal(S.allInside(r, [1, 1, 19, 9]), false)
  assert.equal(S.allInside(r, [1, NaN]), false)
  assert.equal(S.segsTouch(r, [-5, 5, 15, 5]), true, 'segment crossing through the box')
  assert.equal(S.segsTouch(r, [-5, -5, -1, -1]), false)
  assert.equal(S.trisTouch(r, [-10, -10, 30, -10, -10, 30]), true, 'triangle containing the box')
  assert.equal(S.trisTouch(r, [20, 20, 30, 20, 20, 30]), false)
  const all = ['body', 'face', 'edge', 'component']
  assert.equal(S.boxSelKind('face', all, true, true), 'body', 'window around a whole body → body')
  assert.equal(S.boxSelKind('face', all, false, true), 'face')
  assert.equal(S.boxSelKind('face', all, true, false), 'face', 'crossing → faces')
  assert.equal(S.boxSelKind('edge', all, true, true), 'edge')
  assert.equal(S.boxSelKind('body', all, false, false), 'body')
  assert.equal(S.boxSelKind('face', ['edge'], false, false), 'edge', 'filter without faces → edges')
  assert.equal(S.boxSelKind('face', ['component'], false, false), null)
})

test('Q shortcut starts Press Pull in model mode (source contract)', () => {
  const src = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(src, /case 'q':[^\n]*mode === 'model'[^\n]*runCommand\('presspull'/)
})
