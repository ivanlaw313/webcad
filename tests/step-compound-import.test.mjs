import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const worker = globalThis.__wheelWorker
await worker.ready()
const { makeBox, makeCompound } = await import('replicad')

test('STEP compound keeps touching B-rep solids independently selectable', async () => {
  const compound = makeCompound([makeBox([0, 0, 0], [10, 10, 10]), makeBox([10, 0, 0], [20, 10, 10])])
  const parts = await worker.importStepAssembly(await compound.blobSTEP().arrayBuffer())
  assert.equal(parts?.length, 2, await worker.getStepDbg())
  for (const part of parts) {
    assert.match(part.step, /ISO-10303-21/)
    const mesh = await worker.rebuild([{ id: 'step-part', type: 'stepbody', step: part.step, op: 'new' }])
    assert.deepEqual(mesh.failed ?? [], [])
    assert.ok(mesh.triangles.length > 0)
  }
  const bounds = parts.map(p => {
    const xs = p.mesh.vertices.filter((_, i) => i % 3 === 0)
    return [Math.min(...xs), Math.max(...xs)]
  }).sort((a, b) => a[0] - b[0])
  assert.ok(Math.abs(bounds[0][0]) < 1e-5 && Math.abs(bounds[0][1] - 10) < 1e-5)
  assert.ok(Math.abs(bounds[1][0] - 10) < 1e-5 && Math.abs(bounds[1][1] - 20) < 1e-5)
})

test('a single solid remains a single STEP part', async () => {
  const solid = makeBox([0, 0, 0], [10, 10, 10])
  const parts = await worker.importStepAssembly(await solid.blobSTEP().arrayBuffer())
  assert.equal(parts?.length, 1, await worker.getStepDbg())
})

test('STEP exact sources survive project save/reopen and component editing', async () => {
  globalThis.requestAnimationFrame ??= callback => setTimeout(callback, 0)
  const { useApp, buildProjectPayload } = await import('../src/store.ts')
  const initial = useApp.getInitialState()
  useApp.setState({ ...initial }, true)
  const compound = makeCompound([makeBox([0, 0, 0], [10, 10, 10]), makeBox([10, 0, 0], [20, 10, 10])])
  await useApp.getState().importStep(await compound.blobSTEP().arrayBuffer(), 'touching.step')
  assert.equal(useApp.getState().components.length, 2)
  const payload = JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())))
  useApp.setState({ ...initial }, true)
  await useApp.getState().applyProjectData(payload)
  assert.equal(useApp.getState().components.length, 2)
  const part = useApp.getState().components[1]
  await useApp.getState().editComponent(part.id)
  assert.equal(useApp.getState().editingComponent, part.id)
  assert.equal(useApp.getState().features[0].type, 'stepbody')
  assert.deepEqual(useApp.getState().failedFeatureIds, [])
  assert.ok(useApp.getState().bodyMesh.triangles.length > 0)
  useApp.getState().finishComponentEdit()
  assert.equal(useApp.getState().components.length, 2)
  assert.equal(useApp.getState().editingComponent, null)
})
