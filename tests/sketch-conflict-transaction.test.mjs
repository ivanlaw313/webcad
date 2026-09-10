import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const { useApp } = await import('../src/store.ts')
const initial = useApp.getInitialState()
const dim = (id, value) => ({ id, kind: 'dim', type: 'dia', a: { kind: 'circle', shape: 0 }, value })
function setup(extra = {}) {
  useApp.setState({ ...initial, mode: 'sketch', sketchShape: { type: 'circle', c: [40, 40], r: 20 },
    skCons: [dim('k1', 40), dim('k2', 50)], ...extra }, true)
}
test('an outdated overconstraint confirmation cannot remove a dimension in the next sketch state', async () => {
  let answer, shown
  const visible = new Promise(resolve => { shown = resolve })
  setup({ appConfirm: () => { shown(); return new Promise(resolve => { answer = resolve }) } })
  const pending = useApp.getState().resolveSk({ promptOverconstrain: true })
  await visible
  const nextCons = [dim('k2', 60)]
  const nextShape = { type: 'circle', c: [70, 30], r: 30 }
  useApp.setState({ skCons: nextCons, sketchShape: nextShape, status: 'new sketch' })
  answer(false)
  await pending
  assert.deepEqual(useApp.getState().skCons, nextCons)
  assert.deepEqual(useApp.getState().sketchShape, nextShape)
  assert.equal(useApp.getState().status, 'new sketch')
})
test('removing the final constraint clears stale conflict diagnostics', async () => {
  setup({ skCons: [], skConflict: true, skConflictIds: ['k1'] })
  await useApp.getState().resolveSk()
  assert.equal(useApp.getState().skConflict, false)
  assert.deepEqual(useApp.getState().skConflictIds, [])
})
test('an unsatisfied constraint set preserves the last geometry while reporting the conflict', async () => {
  setup({ skCons: [dim('k1', 40), dim('k2', 50), { id: 'k3', kind: 'con', type: 'fix', a: { kind: 'pt', shape: 0, idx: 0 } }] })
  const before = structuredClone(useApp.getState().sketchShape)
  await useApp.getState().resolveSk()
  assert.equal(useApp.getState().skConflict, true)
  assert.deepEqual(useApp.getState().sketchShape, before)
})
test('driving/reference conversion is one undoable edit and preserves measurement precision', async () => {
  setup({ sketchShape: { type: 'circle', c: [40, 40], r: 20.123456 }, skCons: [{ ...dim('k1', 40.246912), driven: true }] })
  await useApp.getState().toggleSkDimDriven('k1')
  assert.equal(useApp.getState().skCons[0].driven, undefined)
  assert.ok(Math.abs(useApp.getState().sketchShape.r - 20.123456) < 1e-8)
  assert.equal(useApp.getState().sketchUndo.length, 1)
  await useApp.getState().undo()
  assert.equal(useApp.getState().skCons[0].driven, true)
  await useApp.getState().redo()
  assert.equal(useApp.getState().skCons[0].driven, undefined)
})
test('a rejected driving conversion preserves both histories and reference dimension', async () => {
  setup({ skCons: [dim('k1', 40), { ...dim('k2', 40), driven: true, expr: '50' }] })
  const before = structuredClone({ cons: useApp.getState().skCons, shape: useApp.getState().sketchShape,
    undo: useApp.getState().sketchUndo, redo: useApp.getState().sketchRedo })
  await useApp.getState().toggleSkDimDriven('k2')
  assert.deepEqual({ cons: useApp.getState().skCons, shape: useApp.getState().sketchShape,
    undo: useApp.getState().sketchUndo, redo: useApp.getState().sketchRedo }, before)
  assert.match(useApp.getState().status, /失败|冲突/)
})
test('reference → driving → upstream diameter edit keeps a downstream bore through undo and JSON/STEP', async () => {
  await import('../src/worker/cad.worker.ts')
  const w = globalThis.__wheelWorker
  await w.ready()
  const { buildProjectPayload } = await import('../src/store.ts')
  const { importSTEP, measureVolume, getOC } = await import('replicad')
  const features = [
    { id: 'disk', type: 'extrude', profile: { kind: 'circle', c: [40, 40], r: 20 }, height: 10, operation: 'new', sketchId: 's1' },
    { id: 'bore', type: 'extrude', profile: { kind: 'circle', c: [40, 40], r: 3 }, height: 10, operation: 'cut' },
  ]
  useApp.setState({ ...initial, features, timelinePos: 2, sketchSources: { s1: {
    shapes: [{ type: 'circle', c: [40, -40], r: 20 }], cons: [{ ...dim('k1', 40), driven: true }],
    plane: 'XY', baseZ: 0, height: 10, op: 'new',
  } } }, true)
  assert.equal(await useApp.getState().applyFeatures(features, 'fixture', false), true)
  async function check(radius) {
    const shape = await importSTEP(new Blob([await w.exportSTEP()]))
    const valid = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false)
    try { assert.equal(valid.IsValid_2(), true) } finally { valid.delete() }
    assert.ok(Math.abs(measureVolume(shape) - Math.PI * (radius ** 2 - 9) * 10) < 1e-4, JSON.stringify({volume:measureVolume(shape),radius,features:useApp.getState().features}))
    assert.deepEqual(useApp.getState().failedFeatureIds, [])
  }
  await check(20)
  await useApp.getState().editSketchOf('disk')
  await useApp.getState().toggleSkDimDriven('k1')
  await useApp.getState().commitSkDim('k1', { value: 50 }, 'diameter')
  await useApp.getState().applySketchEdit('s1')
  assert.equal(useApp.getState().mode, 'model')
  await check(25)
  await useApp.getState().undo()
  await check(20)
  await useApp.getState().redo()
  await check(25)
  const saved = JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())))
  useApp.setState({ ...initial }, true)
  await useApp.getState().applyProjectData(saved)
  await check(25)
})
