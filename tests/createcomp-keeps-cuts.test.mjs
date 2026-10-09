// WORKFLOW2 P2：底板打孔後「新實體」再建柱 → 設為活動底板 → 建立組件；src 必須保留切除，重開編輯體積不可跳回未切。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp, featureIdsForActiveBody } = await import('../src/store.ts')
const { meshVolumeMm3 } = await import('../src/ui/splitVolume.ts')
const g = () => useApp.getState()
const volCm3 = (m) => meshVolumeMm3(m.vertices, m.triangles) / 1000

test('featureIdsForActiveBody keeps plate+cut after newbody+activatebody', () => {
  const feats = [
    { id: 'p', type: 'extrude', operation: 'new' },
    { id: 'c', type: 'extrude', operation: 'cut' },
    { id: 'nb', type: 'newbody' },
    { id: 'cyl', type: 'extrude', operation: 'new' },
    { id: 'act', type: 'activatebody', target: 0 },
  ]
  const ids = featureIdsForActiveBody(feats)
  assert.deepEqual([...ids].sort(), ['c', 'p'])
})

test('createComponent after activate keeps cut volume on re-edit', async () => {
  useApp.setState({ components: [], componentDefs: [], features: [], bodyMesh: null, joints: [], originX: 0, undoStack: [], redoStack: [], editingComponent: null })
  await g().applyFeatures([], 'reset', false)
  const plate = { id: 'p2', type: 'extrude', profile: { kind: 'rect', a: [-40, -40], b: [40, 40] }, height: 10, operation: 'new' }
  const cut = { id: 'c2', type: 'extrude', profile: { kind: 'circle', c: [20, 0], r: 8 }, height: 10, operation: 'cut' }
  await g().applyFeatures([plate, cut], 'plate', false)
  const cutVol = volCm3(g().bodyMesh)
  assert.ok(cutVol < 63.5 && cutVol > 50, `cut plate volume ${cutVol}`)
  await g().applyFeatures([...g().features, { id: 'nb1', type: 'newbody', name: '實體1' }, { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 8 }, height: 30, baseZ: 10, operation: 'new' }], 'park+cyl', false)
  await g().activateParkedBody(0)
  assert.ok(Math.abs(volCm3(g().bodyMesh) - cutVol) < 0.2)
  await g().newComponentActive()
  const c = g().components[0]
  assert.ok(c, 'component created')
  assert.ok(Math.abs(volCm3(c.mesh) - cutVol) < 0.2, `comp mesh ${volCm3(c.mesh)} vs ${cutVol}`)
  assert.ok(c.src?.features?.some((f) => f.operation === 'cut' || f.op === 'cut'), `src features ${JSON.stringify(c.src?.features?.map((f) => f.type + ':' + f.operation))}`)
  assert.ok(!c.src?.features?.some((f) => f.id === 'cyl' || (f.type === 'extrude' && f.operation === 'new' && f.profile?.kind === 'circle' && Math.abs((f.profile?.r ?? 0) - 8) < 1e-6 && (f.height ?? 0) === 30)), 'src must not be the other body')
  await g().editComponent(c.id)
  const editVol = volCm3(g().bodyMesh)
  assert.ok(Math.abs(editVol - cutVol) < 0.5, `re-edit volume ${editVol} jumped (uncut would be 64)` )
  assert.ok(editVol < 63.5, 'must not jump back to 64.00 uncut plate')
})
