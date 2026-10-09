// BUG-207：草圖偏移要關聯（Fusion 式）—— 來源一改，偏移曲線跟住重算；偏移曲線唔加自由度；存檔/開檔/撤銷保留連結。
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, buildProjectPayload, regenOffsetLinks } = await import('../src/store.ts')
const { solveFree } = await import('../src/sketch/freesolve.ts')

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
  assert.deepEqual(off.offsetOf.d, 5)
  near(bbox(off), [-5, -5, 90, 30], 'initial offset is 95x35')
}

test('dragging a source corner regenerates the offset (bbox = source bbox ± 5)', async () => {
  await seedOffset()
  useApp.setState({ sketchTool: 'select' })
  const undoDepth = g().sketchUndo.length
  assert.equal(g().skDragStart([85, 25]), true, g().status)
  await g().skDragMove([103.6, 41])
  await g().skDragEnd([103.6, 41])
  const { off, src } = linked()
  near(bbox(src), [0, 0, 103.6, 41], 'source dragged')
  near(bbox(off), expand(bbox(src), 5), 'offset follows dragged source')
  // offset curve contributes no DOF: rectangle alone = 4
  assert.equal(g().skDof, 4, `DOF should be source-only, got ${g().skDof}`)
  // undo restores source and the offset with it
  assert.equal(g().sketchUndo.length, undoDepth + 1)
  await g().undo()
  const u = linked()
  near(bbox(u.src), [0, 0, 85, 25], 'undo source')
  near(bbox(u.off), [-5, -5, 90, 30], 'undo offset')
})

test('dragging the offset itself is refused (derived geometry)', async () => {
  await seedOffset()
  useApp.setState({ sketchTool: 'select' })
  assert.equal(g().skDragStart([90, 30]), false)
  assert.match(g().status, /偏移曲線跟隨來源/)
})

test('width change through solver (dimension) regenerates the offset; solver ignores derived DOF', async () => {
  await seedOffset()
  const shapes = g().sketchProfiles
  const si = shapes.findIndex((s) => s.sid)
  const cons = [{ id: 'w', kind: 'dim', type: 'hdist', a: { kind: 'pt', shape: si, idx: 0 }, b: { kind: 'pt', shape: si, idx: 1 }, value: 120 }]
  const res = await solveFree(structuredClone(shapes), cons)
  assert.ok(res && !res.conflict, 'solve ok')
  assert.equal(res.dof, 3, 'rectangle (4) − width dim (1); offset adds nothing')
  useApp.setState({ sketchProfiles: res.shapes, skCons: cons })
  const { off, src } = linked()
  assert.ok(Math.abs(bbox(src)[2] - bbox(src)[0] - 120) < 1e-6)
  near(bbox(off), expand(bbox(src), 5), 'offset follows width dimension')
})

test('save/open roundtrip keeps the link and it still drives the offset', async () => {
  await seedOffset()
  const payload = json()
  assert.ok(payload.sketchDraft.sketchProfiles.some((s) => s.offsetOf?.d === 5))
  await g().reset()
  await g().applyProjectData(payload)
  const { off, src } = linked()
  assert.ok(off && src, 'link survives roundtrip')
  const i = g().sketchProfiles.indexOf(src)
  useApp.setState({ sketchProfiles: g().sketchProfiles.map((s, k) => k === i ? { ...s, b: [60, 50] } : s) })
  const after = linked()
  near(bbox(after.off), expand(bbox(after.src), 5), 'offset follows source after reopen')
})

test('regenOffsetLinks: orphan/duplicate links are released, inward offsets and circles work', () => {
  assert.equal(regenOffsetLinks([{ type: 'rect', a: [0, 0], b: [10, 10] }]), null)
  const orphan = regenOffsetLinks([{ type: 'rect', a: [0, 0], b: [10, 10], offsetOf: { src: 'gone', d: 2 } }])
  assert.equal(orphan[0].offsetOf, undefined)
  const circ = regenOffsetLinks([{ type: 'circle', c: [1, 2], r: 10, sid: 'c' }, { type: 'circle', c: [0, 0], r: 3, offsetOf: { src: 'c', d: -4 } }])
  assert.deepEqual([circ[1].c, circ[1].r], [[1, 2], 6])
  const dup = regenOffsetLinks([{ type: 'rect', a: [0, 0], b: [10, 10], sid: 's' }, { type: 'rect', a: [-1, -1], b: [11, 11], offsetOf: { src: 's', d: 1 } }, { type: 'rect', a: [50, 50], b: [60, 60], offsetOf: { src: 's', d: 1 } }])
  assert.equal(dup[2].offsetOf, undefined, 'copied offset is released, not snapped onto source')
  assert.deepEqual(bbox(dup[2]), [50, 50, 60, 60])
})
