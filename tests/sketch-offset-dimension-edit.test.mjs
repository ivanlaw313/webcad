// Fusion behaviour: after an associative sketch Offset is created its distance stays an editable sketch dimension.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, editOffsetLinkDistance } = await import('../src/store.ts')
const fs = await import('node:fs')

const g = () => useApp.getState()
const json = () => JSON.parse(JSON.stringify(buildProjectPayload(g())))
const bbox = (sh) => {
  const pts = sh.type === 'rect' ? [sh.a, sh.b] : sh.type === 'circle' ? [[sh.c[0] - sh.r, sh.c[1] - sh.r], [sh.c[0] + sh.r, sh.c[1] + sh.r]] : (sh.verts ?? sh.pts)
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
const near = (a, b, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-6, `${msg}: ${a} != ${b}`))
const expand = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d]
const linked = () => {
  const shapes = g().sketchProfiles
  const off = shapes.find((s) => s.offsetOf)
  const src = shapes.find((s) => s.sid && s.sid === off?.offsetOf.src)
  return { off, src }
}

// Like the live app: a drawn rectangle carries 4 H/V relations (ribbon: constraints 4 · DOF 4).
const RECT_HV = [0, 1, 2, 3].map((idx) => ({ id: `hv${idx}`, kind: 'con', type: idx % 2 ? 'v' : 'h', a: { kind: 'edge', shape: 0, idx } }))
async function seedOffset() {
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'offset', sketchProfiles: [{ type: 'rect', a: [0, 0], b: [85, 25] }], sketchShape: null, skCons: RECT_HV, sketchOffsetD: 5, sketchOffsetBoth: false })
  await g().skOffsetAt([85, 12])   // 1st click locks target
  assert.ok(g().sizing, g().status)
  useApp.setState({ sketchOffsetD: 5 })
  await g().skOffsetAt([90, 12])   // 2nd click commits
  assert.match(g().status, /已偏移 5mm（外）/)
  const { off, src } = linked()
  assert.ok(off && src, 'offset contour must carry a link to its source')
  near(bbox(off), [-5, -5, 90, 30], 'initial offset is 95x35')
}
const offIndex = () => g().sketchProfiles.findIndex((s) => s.offsetOf)

test('editing the offset dimension re-derives the curve, keeps the link, and is one sketch undo step', async () => {
  await seedOffset()
  useApp.setState({ sketchTool: 'select' })
  const depth = g().sketchUndo.length
  g().setSketchDimValue(offIndex(), 'off', 8)
  await new Promise((r) => setTimeout(r, 0))
  let { off, src } = linked()
  assert.equal(off.offsetOf.d, 8, g().status)
  near(bbox(off), expand(bbox(src), 8), 'offset is now source ± 8')
  assert.match(g().status, /偏移距離/)
  assert.equal(g().sketchUndo.length, depth + 1)
  // the source still drives it with the NEW distance
  assert.equal(g().skDragStart([85, 25]), true, g().status)
  await g().skDragMove([100, 40]); await g().skDragEnd([100, 40])
  ;({ off, src } = linked())
  near(bbox(src), [0, 0, 100, 40], 'source dragged')
  near(bbox(off), expand(bbox(src), 8), 'offset follows source with edited distance')
  await g().undo(); await g().undo()
  ;({ off } = linked())
  assert.equal(off.offsetOf.d, 5, 'undo restores the original distance')
  near(bbox(off), [-5, -5, 90, 30], 'undo restores the original curve')
})

test('inward offsets keep their side; collapse / zero / duplicate are rejected without change', async () => {
  const src = { type: 'rect', a: [0, 0], b: [40, 20], sid: 's1' }
  const inner = { type: 'rect', a: [2, 2], b: [38, 18], offsetOf: { src: 's1', d: -2 } }
  const outer = { type: 'rect', a: [-3, -3], b: [43, 23], offsetOf: { src: 's1', d: 3 } }
  const ok = editOffsetLinkDistance([src, inner, outer], 1, 4)
  assert.ok('shapes' in ok)
  assert.deepEqual(ok.shapes[1].offsetOf, { src: 's1', d: -4 })
  near(bbox(ok.shapes[1]), [4, 4, 36, 16], 'inward stays inward')
  assert.match(editOffsetLinkDistance([src, inner, outer], 1, 10).error, /自交|塌陷/)
  assert.match(editOffsetLinkDistance([src, inner, outer], 1, 0).error, /正數/)
  assert.match(editOffsetLinkDistance([src, inner, outer], 2, 3.0000000001).shapes ? 'same' : 'x', /same/)
  assert.match(editOffsetLinkDistance([src, inner, { ...outer, offsetOf: { src: 's1', d: -3 } }], 1, 3).error, /相同距離/)
  assert.match(editOffsetLinkDistance([src, inner], 0, 3).error, /唔係關聯偏移/)
  // store: rejected edit leaves geometry and history alone
  await seedOffset()
  const before = JSON.stringify(g().sketchProfiles), depth = g().sketchUndo.length
  g().setSketchDimValue(offIndex(), 'off', -1)
  assert.equal(JSON.stringify(g().sketchProfiles), before)
  assert.equal(g().sketchUndo.length, depth)
})

test('the sketch layer shows ONE editable offset dimension on a linked curve and routes it to setSketchDimValue', () => {
  const src = fs.readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  const start = src.indexOf('function buildDimLabels'), body = src.slice(start, src.indexOf('if (sh.construction) return', start))
  assert.match(body, /if \(sh\.offsetOf\)/)
  assert.match(body, /edit: \{ target, dim: 'off', value: Math\.abs\(sh\.offsetOf\.d\) \}/)
  assert.match(body, /return\s*\n\s*\}\s*$/, 'linked curves do not also get W/H/Ø soft labels')
  assert.match(src, /else if\(e\.dim!=='con'\)setDim\(e\.target, e\.dim, v\)/)
})
