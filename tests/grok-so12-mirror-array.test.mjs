/**
 * SO12 / handoff P1 (05-fix-priority): mirror / array crash or wrong active body.
 * Acceptance: selected hole feature preselects correctly; rectangular/circular array
 * identity + count correct; Undo/Redo; illegal count rejected atomically; feature
 * mirror must not crash (BUG-SO12-001 lineage — dependent pattern after mirror).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')
const { expandHoleFeature } = await import('../src/cad/holeFeature.ts')

const g = () => useApp.getState()
const plate = { id: 'base', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 12, operation: 'new' }
const hole = { id: 'hole', type: 'hole', kind: 'simple', center: [-15, 0], top: 12, diameter: 4, through: true }

function expand(feats) {
  const out = [], expanded = new Map()
  for (const f of feats) {
    if (f.type === 'hole') {
      const cuts = expandHoleFeature(f)
      expanded.set(f.id, cuts.map((c) => c.id))
      out.push(...cuts)
      continue
    }
    out.push(f)
  }
  return out.map((f) => {
    const t = f.targets
    if (!t?.length) return f
    return { ...f, targets: [...new Set(t.flatMap((id) => expanded.get(id) ?? [id]))] }
  })
}

async function vol() {
  return measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))
}

test('incremental feature-mirror of circular pattern keeps pattern source snaps (SO12)', async () => {
  const base = [
    plate, hole,
    { id: 'pat', type: 'pattern', countX: 2, countY: 3, dx: 10, dy: 15, targets: ['hole'] },
    { id: 'circ', type: 'circPattern', origin: [0, 0, 0], dir: [0, 0, 1], count: 6, totalAngle: 360, mode: 'full', targets: ['hole'] },
  ]
  const before = await w.rebuild(expand(base))
  assert.deepEqual(before.warnings ?? [], [])
  const v0 = await vol()
  const after = await w.rebuild(expand([
    ...base,
    { id: 'mirror', type: 'mirror', plane: 'YZ', offset: 10, targets: ['circ'] },
  ]))
  assert.ok(!(after.warnings ?? []).some((s) => /目标特征唔存在|已被抑制|跳过该目标/.test(s)), JSON.stringify(after.warnings))
  assert.deepEqual(after.failed ?? [], [])
  assert.ok(await vol() < v0 - 1, 'mirrored patterned holes must remove additional material')
})

test('feature mirror of hole after fillet/chamfer does not fail (BUG-SO12-001)', async () => {
  const feats = [
    plate,
    { id: 'boss', type: 'extrude', profile: { kind: 'rect', a: [20, -5], b: [30, 5] }, height: 5, baseZ: 12, operation: 'new' },
    { ...hole, center: [-10, 5] },
    { id: 'fillet', type: 'fillet', radius: 0.5, nears: [[30, 0, 17]], chain: false },
    { id: 'chamfer', type: 'chamfer', distance: 0.2, nears: [[-30, 0, 12]], chain: false },
    { id: 'mirror', type: 'mirror', plane: 'YZ', targets: ['hole'] },
  ]
  const mesh = await w.rebuild(expand(feats))
  assert.deepEqual(mesh.failed ?? [], [])
  assert.ok(!(mesh.warnings ?? []).some((s) => /镜像.*失败|目标特征/.test(s)), JSON.stringify(mesh.warnings))
  assert.ok((await vol()) > 1)
})

test('openFeatDlg preselects selected hole as feature target for mirror/array', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([plate, hole], 'seed'), true, g().status)
  g().selectFeature('hole')
  g().openFeatDlg('mirror')
  assert.equal(g().featDlg?.kind, 'mirror')
  assert.equal(g().featDlg?.params.target, 'feature')
  g().openFeatDlg('pattern')
  assert.equal(g().featDlg?.params.objectType, 'features')
  assert.equal(g().featDlg?.params.target, 'feature')
  assert.equal(+g().featDlg?.params.objectPicked, 1)
  g().openFeatDlg('circpattern')
  assert.equal(g().featDlg?.params.objectType, 'features')
  assert.equal(g().featDlg?.params.target, 'feature')
  assert.equal(+g().featDlg?.params.objectPicked, 1)
})

test('commitFeatDlg rejects illegal array counts atomically', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([plate, hole], 'seed'), true, g().status)
  g().selectFeature('hole')
  const before = { features: structuredClone(g().features), undo: g().undoStack.length, redo: g().redoStack.length, body: g().bodyMesh }

  g().openFeatDlg('circpattern')
  for (const bad of [0, 1, -1, NaN]) {
    useApp.getState().setFeatParam('count', bad)
    await g().commitFeatDlg()
    assert.match(g().status, /数量至少为 2|非法/)
    assert.ok(g().featDlg, 'dialog stays open')
    assert.deepEqual(g().features, before.features)
    assert.equal(g().undoStack.length, before.undo)
    assert.equal(g().redoStack.length, before.redo)
    assert.equal(g().bodyMesh, before.body)
  }

  g().openFeatDlg('pattern')
  useApp.getState().setFeatParam('countX', 0)
  useApp.getState().setFeatParam('countY', 3)
  await g().commitFeatDlg()
  assert.match(g().status, /正整数|数量/)
  assert.deepEqual(g().features, before.features)
  assert.equal(g().undoStack.length, before.undo)

  useApp.getState().setFeatParam('countX', 1)
  useApp.getState().setFeatParam('countY', 1)
  useApp.getState().setFeatParam('countZ', 1)
  await g().commitFeatDlg()
  assert.match(g().status, /至少为 2|冇阵列/)
  assert.deepEqual(g().features, before.features)
})

test('hole rectangular + circular pattern identity, undo/redo, legal confirm', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([plate, hole], 'seed'), true, g().status)
  const oneHole = Math.PI * 4 * 12
  const seedVol = await vol()
  g().selectFeature('hole')
  g().openFeatDlg('pattern')
  useApp.getState().setFeatParam('countX', 2)
  useApp.getState().setFeatParam('countY', 1)
  useApp.getState().setFeatParam('dx', 30)
  useApp.getState().setFeatParam('dy', 15)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  const pat = g().features.find((f) => f.type === 'pattern')
  assert.ok(pat)
  assert.deepEqual(pat.targets, ['hole'])
  assert.equal(pat.countX, 2)
  assert.equal(pat.countY, 1)
  assert.ok(Math.abs((await vol()) - (seedVol - oneHole)) < 0.05)

  g().selectFeature('hole')
  g().openFeatDlg('circpattern')
  useApp.getState().setFeatParam('count', 6)
  useApp.getState().setFeatParam('mode', 'full')
  useApp.getState().setFeatParam('ox', 0)
  useApp.getState().setFeatParam('oy', 0)
  useApp.getState().setFeatParam('oz', 0)
  useApp.getState().setFeatParam('dx', 0)
  useApp.getState().setFeatParam('dy', 0)
  useApp.getState().setFeatParam('dz', 1)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  const circ = g().features.find((f) => f.type === 'circPattern')
  assert.ok(circ)
  assert.deepEqual(circ.targets, ['hole'])
  assert.equal(circ.count, 6)

  const withCirc = await vol()
  await g().undo()
  assert.ok(!g().features.some((f) => f.type === 'circPattern'))
  await g().redo()
  assert.ok(g().features.some((f) => f.type === 'circPattern'))
  assert.ok(Math.abs((await vol()) - withCirc) < 0.05)

  g().selectFeature('hole')
  g().openFeatDlg('mirror')
  assert.equal(g().featDlg.params.target, 'feature')
  useApp.getState().setFeatParam('plane', 'YZ')
  useApp.getState().setFeatParam('offset', 5)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.ok(g().features.some((f) => f.type === 'mirror' && f.targets?.includes('hole')))
  assert.ok(!(g().lastBuildWarnings ?? []).some((s) => /目标特征唔存在|跳过该目标/.test(s)), JSON.stringify(g().lastBuildWarnings))
  assert.ok((await vol()) < withCirc - 1)
})
