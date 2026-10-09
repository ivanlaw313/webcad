// 2b9f11a 精簡版：參數 t 改厚度 → 水平腿頂面草圖（通孔）跟住郁。
// 完整 L-bracket+圓角+鏡像見 param-face-sketch-follow.test.mjs；呢度只驗證 face binding 核心。
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

async function seedL(t = 8) {
  const pts = [[0, 0], [50, 0], [50, t], [t, t], [t, 40], [0, 40]]
  const P = (i) => ({ kind: 'pt', shape: 0, idx: i })
  const cons = [
    { id: 'fx', kind: 'con', type: 'fix', a: P(0) },
    { id: 'h0', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 0 } },
    { id: 'v1', kind: 'con', type: 'v', a: { kind: 'edge', shape: 0, idx: 1 } },
    { id: 'h2', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 2 } },
    { id: 'v3', kind: 'con', type: 'v', a: { kind: 'edge', shape: 0, idx: 3 } },
    { id: 'h4', kind: 'con', type: 'h', a: { kind: 'edge', shape: 0, idx: 4 } },
    { id: 'v5', kind: 'con', type: 'v', a: { kind: 'edge', shape: 0, idx: 5 } },
    { id: 'L', kind: 'dim', type: 'hdist', a: P(0), b: P(1), value: 50 },
    { id: 'H', kind: 'dim', type: 'vdist', a: P(0), b: P(5), value: 40 },
    { id: 't1', kind: 'dim', type: 'vdist', a: P(1), b: P(2), value: t, param: 't', paramId: 'pt' },
    { id: 't2', kind: 'dim', type: 'hdist', a: P(5), b: P(4), value: t, param: 't', paramId: 'pt' },
  ]
  useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)
  useApp.setState({ params: [{ id: 'pt', name: 't', value: t, unit: 'mm' }] })
  g().startSketch(); g().chooseSketchPlane('XZ')
  useApp.setState({ sketchShape: null, sketchProfiles: [{ type: 'poly', pts }], skCons: cons, extrudeHeight: 30, sketchOp: 'new' })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
}

async function throughHoleOnLegTop() {
  const t = g().params.find((p) => p.name === 't').value
  await g().startSketchOnFace([30, t, 15], [0, 0, 1])
  assert.equal(g().mode, 'sketch', g().status)
  useApp.setState({
    sketchShape: null,
    sketchProfiles: [{ type: 'circle', c: [30, 15], r: 3 }],
    skCons: [],
    sketchOp: 'cut',
    extrudeExtent: 'through',
    faceCutThrough: true,
    extrudeHeight: 8,
  })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
}

const holeSrc = () => Object.values(g().sketchSources).find((x) => x.faceBinding)

test('t 8→12: face-hosted through-hole sketch plane follows the leg top (no fillet/mirror)', async () => {
  await seedL(8)
  await throughHoleOnLegTop()
  assert.deepEqual(g().failedFeatureIds, [])
  assert.equal(holeSrc().baseZ, 8)
  const srcId = g().features[0].id

  await g().setParam('t', 12)
  assert.deepEqual(g().failedFeatureIds, [], JSON.stringify(g().featureErrors))
  assert.equal(g().params.find((p) => p.name === 't').value, 12, g().status)
  assert.equal(g().paramFailure, null)
  assert.equal(holeSrc().baseZ, 12, 'sketch plane moved with thickness')
  const hole = g().features.find((f) => f.sketchFaceBinding)
  assert.ok(hole, 'cut feature keeps sketchFaceBinding')
  assert.ok(Math.abs(hole.sketchFaceBinding.offset - 12) < 1e-9)
  assert.equal(hole.sketchFaceBinding.sourceId, srcId)
  assert.doesNotMatch(g().status, /失效|歧義|未能套用/)
})

test('failed thickness edit (t=0) keeps model + reports 未能套用 (panel draft path)', async () => {
  await seedL(8)
  await throughHoleOnLegTop()
  const beforeZ = holeSrc().baseZ
  await g().setParam('t', 0)
  assert.equal(g().params.find((p) => p.name === 't').value, 8)
  assert.equal(holeSrc().baseZ, beforeZ)
  assert.ok(g().paramFailure)
  assert.match(g().status, /參數 t = 0 未能套用/)
  assert.deepEqual(g().failedFeatureIds, [])
})
