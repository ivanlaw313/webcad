/**
 * SO03 / handoff P1: Extrude reverse / negative distance must persist.
 * Acceptance: Reverse/negative direction saved to JSON and reopen has same
 * geometry direction; zero-length rejected.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, buildProjectPayload } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()

async function bboxZ() {
  const shape = await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]))
  try {
    const b = shape.boundingBox.bounds
    return { z0: b[0][2], z1: b[1][2], vol: measureVolume(shape) }
  } finally {
    shape.delete()
  }
}

async function sketchRectExtrude(setup) {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'rect', a: [0, 0], b: [20, 10] },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
  })
  g().openExtrudeDlg()
  await setup()
  await g().extrudeSketch()
}

function assertDownSolid(box, height = 5) {
  assert.ok(Math.abs(box.z0 + height) < 1e-5, `expected z0≈${-height}, got ${box.z0}`)
  assert.ok(Math.abs(box.z1) < 1e-5, `expected z1≈0, got ${box.z1}`)
  assert.ok(Math.abs(box.vol - 20 * 10 * height) < 1e-4, `vol ${box.vol}`)
}

test('⇅ flip + positive distance: down persists through JSON reopen', async () => {
  await sketchRectExtrude(() => {
    g().setExtrudeHeight(5)
    g().toggleExtrudeFlip()
  })
  const f = g().features.find((x) => x.type === 'extrude')
  assert.ok(f, g().status)
  assert.equal(f.height, 5)
  assert.equal(f.down, true)
  assertDownSolid(await bboxZ())

  const sk = Object.keys(g().sketchSources)[0]
  assert.equal(g().sketchSources[sk].down, true, 'sketchSources.down must match feature')

  const saved = JSON.parse(JSON.stringify(buildProjectPayload(g())))
  assert.equal(saved.features.find((x) => x.type === 'extrude').down, true)
  await g().reset()
  await g().applyProjectData(saved)
  const f2 = g().features.find((x) => x.type === 'extrude')
  assert.equal(f2.down, true)
  assertDownSolid(await bboxZ())
})

test('negative distance expression: down persists through JSON reopen', async () => {
  await sketchRectExtrude(() => {
    g().setExtrudeExpression('-5')
  })
  const f = g().features.find((x) => x.type === 'extrude')
  assert.ok(f, g().status)
  assert.equal(f.height, 5)
  assert.equal(f.down, true)
  assert.equal(f.distanceExpression?.expression, '-5')
  assert.equal(f.distanceExpression?.flip, false)
  assertDownSolid(await bboxZ())

  const saved = JSON.parse(JSON.stringify(buildProjectPayload(g())))
  await g().reset()
  await g().applyProjectData(saved)
  assert.equal(g().features.find((x) => x.type === 'extrude').down, true)
  assertDownSolid(await bboxZ())
})

test('zero-length extrude is rejected; model and history unchanged', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'rect', a: [0, 0], b: [20, 10] },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
  })
  g().openExtrudeDlg()
  g().setExtrudeHeight(0)
  const before = {
    features: structuredClone(g().features),
    undo: g().undoStack.length,
    shape: g().sketchShape,
  }
  await g().extrudeSketch()
  assert.match(g().status, /非零/)
  assert.deepEqual(g().features, before.features)
  assert.equal(g().undoStack.length, before.undo)
  assert.ok(g().sketchShape, 'sketch must remain after reject')
})

test('extrude-edit reverse toggle persists down and sketchSources.down', async () => {
  await sketchRectExtrude(() => {
    g().setExtrudeHeight(5)
  })
  const id = g().features.find((x) => x.type === 'extrude').id
  const sk = Object.keys(g().sketchSources)[0]
  assert.equal(g().features[0].down, undefined)
  assert.equal(g().sketchSources[sk].down, undefined)

  g().openFeatDlgForEdit(id)
  assert.equal(g().featDlg?.kind, 'extrude-edit')
  g().setFeatParam('heightExprFlip', 1)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.equal(g().features.find((x) => x.id === id).down, true)
  assert.equal(g().sketchSources[sk].down, true, 'edit must sync sketchSources.down')
  assertDownSolid(await bboxZ())

  // Negative expr on edit also flips and syncs sketchSources
  g().openFeatDlgForEdit(id)
  g().setFeatParam('heightExprFlip', 0)
  g().setFeatParam('heightExpr', '-6')
  await g().commitFeatDlg()
  assert.equal(g().features.find((x) => x.id === id).down, true)
  assert.equal(g().features.find((x) => x.id === id).height, 6)
  assert.equal(g().sketchSources[sk].down, true)
  assertDownSolid(await bboxZ(), 6)
})

test('extrude-edit zero distance rejected without mutating feature', async () => {
  await sketchRectExtrude(() => {
    g().setExtrudeHeight(5)
    g().toggleExtrudeFlip()
  })
  const id = g().features.find((x) => x.type === 'extrude').id
  const before = structuredClone(g().features)
  g().openFeatDlgForEdit(id)
  g().setFeatParam('heightExpr', '0')
  await g().commitFeatDlg()
  assert.match(g().status, /非零/)
  assert.ok(g().featDlg, 'dialog stays open on reject')
  assert.deepEqual(g().features, before)
  assert.equal(g().features.find((x) => x.id === id).down, true)
})

test('extrude-edit UI exposes reverse control bound to heightExprFlip', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  const blockStart = vp.indexOf("{featDlg.kind === 'extrude-edit' && (() => {")
  assert.ok(blockStart >= 0)
  const block = vp.slice(blockStart, blockStart + 3500)
  assert.match(block, /setFeatParam\('heightExprFlip'/)
  assert.match(block, /⇅ 反向方向/)
})
