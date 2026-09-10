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
const { useApp, buildProjectPayload } = await import('../src/store.ts')
const { importSTEP, measureVolume, getOC } = await import('replicad')
async function checkVolume(expected) {
  const shape = await importSTEP(new Blob([await w.exportSTEP()]))
  const check = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false)
  try { assert.ok(check.IsValid_2()) } finally { check.delete() }
  assert.ok(Math.abs(measureVolume(shape) - expected) < 1e-5)
}
test('upstream plate edit refreshes construction projection without creating material, then undo/redo and save', async () => {
  const features = [
    { id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [10, 10] }, height: 10, operation: 'new' },
    { id: 'guide', type: 'sketch', sketchId: 's1' },
  ]
  useApp.setState({ ...useApp.getInitialState(), features, timelinePos: 2, sketchSources: { s1: {
    shapes: [{ type: 'poly', pts: [[0, 0], [10, 0], [10, -10], [0, -10]], construction: true, projected: true, projectLink: 'all' }],
    cons: [], plane: 'XY', baseZ: 10, height: 10, op: 'new',
  } } }, true)
  assert.equal(await useApp.getState().applyFeatures(features, 'fixture', false), true)
  await useApp.getState().editSketchOf('guide')
  assert.doesNotMatch(useApp.getState().status, /来源不可用/)
  await useApp.getState().applySketchEdit('s1')
  await checkVolume(1000)
  const edited = useApp.getState().features.map(f => f.id === 'plate' ? { ...f, profile: { ...f.profile, b: [12, 10] } } : f)
  assert.equal(await useApp.getState().applyFeatures(edited, 'resize'), true)
  await useApp.getState().editSketchOf('guide')
  assert.equal(useApp.getState().sketchProfiles[0].construction, true)
  assert.equal(Math.max(...useApp.getState().sketchProfiles[0].pts.map(p => p[0])), 12)
  await useApp.getState().applySketchEdit('s1')
  await checkVolume(1200)
  await useApp.getState().undo()
  await checkVolume(1200)
  await useApp.getState().redo()
  await checkVolume(1200)
  const saved = JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())))
  useApp.setState({ ...useApp.getInitialState() }, true)
  await useApp.getState().applyProjectData(saved)
  assert.equal(useApp.getState().sketchSources.s1.shapes[0].construction, true)
  await checkVolume(1200)
})
test('lost projection diagnostics persist with the sketch and Break Link is undoable', async () => {
  const curve = { type: 'poly', pts: [[0, 0], [10, 0], [10, -10], [0, -10]], construction: true, projected: true, projectLink: 'all' }
  const features = [{ id: 'guide', type: 'sketch', sketchId: 's1' }]
  useApp.setState({ ...useApp.getInitialState(), features, timelinePos: 1, sketchSources: { s1: {
    shapes: [curve], cons: [], plane: 'XY', baseZ: 10, height: 0, op: 'new',
  } } }, true)
  await useApp.getState().applyFeatures(features, 'fixture', false)
  await useApp.getState().editSketchOf('guide')
  assert.equal(useApp.getState().sketchProfiles[0].projectLinkIssue, 'missing-source')
  await useApp.getState().applySketchEdit('s1')
  const saved = JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())))
  useApp.setState({ ...useApp.getInitialState() }, true)
  await useApp.getState().applyProjectData(saved)
  assert.equal(useApp.getState().sketchSources.s1.shapes[0].projectLinkIssue, 'missing-source')
  await useApp.getState().editSketchOf('guide')
  useApp.getState().breakProjectLinks()
  assert.equal(useApp.getState().sketchShape.projectLinkIssue, undefined)
  assert.deepEqual(useApp.getState().sketchShape.pts, curve.pts)
  await useApp.getState().undo()
  assert.equal(useApp.getState().sketchProfiles[0].projectLinkIssue, 'missing-source')
  await useApp.getState().redo()
  assert.equal(useApp.getState().sketchShape.projectLinkIssue, undefined)
})
