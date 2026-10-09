// presspull-preselected-face.test.mjs — Fusion Press Pull: a pre-selected B-rep face (click / box / right-click)
// goes straight into Press Pull; distance + 確定 offsets the face and the solid's volume really changes.
// With nothing selected and a solid present, Press Pull waits for a face (no longer opens the profile Extrude dialog).
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')
const g = () => useApp.getState()
const volume = async () => measureVolume(await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()])))
// 20 × 10 profile extruded 10 mm → 2000 mm³ box (CAD x 0..20, y −10..0, z 0..10); top face at CAD z = 10 (three y = 10).
async function box() {
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchProfiles: [{ type: 'rect', a: [0, 0], b: [20, 10] }], skCons: [], appConfirm: async () => true }, true)
  useApp.setState({ extrudeHeight: 10, sketchOp: 'new' })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model')
  assert.ok(Math.abs(await volume() - 2000) < 1e-3)
}
const topFace = (extra = {}) => ({ kind: 'face', key: 'f-top', pt: [10, 10, 5], tris: [0, -10, 10, 20, -10, 10, 20, 0, 10], ...extra })

test('pre-selected top face + Press Pull 5 mm → volume 2000 → 3000 mm³', async () => {
  await box()
  g().modelSelSet([topFace({ n: [0, 0, 1] })], false)
  await g().runCommand('presspull', '按拉')
  assert.equal(g().pushPullMode, true, g().status)
  assert.equal(g().extrudeDlgOpen, false, 'must not open the profile Extrude dialog')
  assert.equal(g().pushPullPicks.length, 1)
  assert.equal(g().modelSel.length, 0)
  g().setPushPullDist(5)
  await g().commitPushPull()
  assert.equal(g().pushPullMode, false, g().status)
  assert.ok(Math.abs(await volume() - 3000) < 1e-2, `volume after press pull: ${await volume()} (${g().status})`)
})

test('pre-selected face without stored normal (box select / tris only) also press-pulls inward', async () => {
  await box()
  g().modelSelSet([topFace()], false)
  await g().runCommand('presspull', '按拉')
  assert.equal(g().pushPullPicks.length, 1)
  g().setPushPullDist(-4)
  await g().commitPushPull()
  assert.ok(Math.abs(await volume() - 1200) < 1e-2, `volume: ${await volume()} (${g().status})`)
})

test('no selection + existing solid (sketch profiles still around) → Press Pull awaits a face, not Extrude', async () => {
  await box()
  useApp.setState({ sketchProfiles: [{ type: 'rect', a: [0, 0], b: [20, 10] }], modelSel: [] })
  await g().runCommand('presspull', '按拉')
  assert.equal(g().pushPullMode, true)
  assert.equal(g().extrudeDlgOpen, false)
})
