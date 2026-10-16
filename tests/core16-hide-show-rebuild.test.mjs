/**
 * CORE16 residual more14: Hide / show body then rebuild must not crash;
 * volume + store (bodyHidden / features) stay coherent.
 * APIs: toggleBodyHidden / setBodyHidden / showAllBodies; rebuild via applyFeatures.
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
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const { ACTIVE_BODY_KEY } = await import('../src/ui/contextMenus.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => {
  const buf = await w.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}
const near = (a, b, t = 1) => Math.abs(a - b) < t
const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const FILLET = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }

test('source: toggleBodyHidden / setBodyHidden Formal status wired; applyFeatures does not clear bodyHidden', () => {
  assert.equal(typeof g().toggleBodyHidden, 'function')
  assert.equal(typeof g().setBodyHidden, 'function')
  assert.equal(typeof g().showAllBodies, 'function')
  assert.equal(ACTIVE_BODY_KEY, 'active')
  const st = rd('src/store.ts')
  assert.match(st, /toggleBodyHidden:\s*\(key\)\s*=>\s*set\(/)
  assert.match(st, /已隱藏實體/)
  assert.match(st, /已顯示實體/)
  // applyFeatures body must not wipe bodyHidden in its signature path
  const af = st.slice(st.indexOf('applyFeatures: async'), st.indexOf('applyFeatures: async') + 2500)
  assert.doesNotMatch(af, /bodyHidden:\s*\[\]/)
})

test('runtime: hide active → rebuild fillet → volume coherent; bodyHidden persists', async () => {
  reset()
  assert.ok(await g().applyFeatures([BOX], 'box'), g().status)
  const vBox = await vol()
  assert.ok(near(vBox, 40 * 30 * 20, 1), `box vol ${vBox}`)

  g().toggleBodyHidden(ACTIVE_BODY_KEY)
  assert.deepEqual(g().bodyHidden, ['active'])
  assert.equal(g().status, '已隱藏實體')

  // rebuild while hidden — must not crash; geometry still advances
  assert.ok(await g().applyFeatures([BOX, FILLET], 'add fillet while hidden'), g().status)
  assert.deepEqual(g().bodyHidden, ['active'], 'hide state survives rebuild')
  assert.equal(g().failedFeatureIds.length, 0, g().status)
  assert.ok(g().bodyMesh?.triangles?.length > 0, 'mesh still present after hidden rebuild')
  const vFillet = await vol()
  assert.ok(vFillet < vBox - 1, `fillet cuts volume while hidden: ${vFillet} < ${vBox}`)
  assert.ok(Number.isFinite(vFillet) && vFillet > 0)
})

test('runtime: show after hide+rebuild restores visibility; store coherent', async () => {
  reset()
  assert.ok(await g().applyFeatures([BOX, FILLET], 'box+fillet'), g().status)
  const v0 = await vol()
  g().setBodyHidden(ACTIVE_BODY_KEY, true)
  assert.deepEqual(g().bodyHidden, ['active'])
  assert.equal(g().status, '已隱藏實體')

  // second rebuild (noop re-apply) while hidden
  assert.ok(await g().applyFeatures([...g().features], 'rebuild while hidden'), g().status)
  assert.deepEqual(g().bodyHidden, ['active'])
  const vHid = await vol()
  assert.ok(near(vHid, v0, 1), `volume unchanged across hidden rebuild: ${vHid} vs ${v0}`)

  g().toggleBodyHidden(ACTIVE_BODY_KEY)
  assert.deepEqual(g().bodyHidden, [])
  assert.equal(g().status, '已顯示實體')
  const vShow = await vol()
  assert.ok(near(vShow, v0, 1), `show does not change volume: ${vShow} vs ${v0}`)
  assert.equal(g().features.length, 2)
  assert.equal(g().failedFeatureIds.length, 0)
})

test('runtime: hide parked body + showAllBodies; rebuild stays coherent', async () => {
  reset()
  const feats = [
    { ...BOX, a: 40, b: 30, c: 10 },
    { id: 'Cy', type: 'prim', shape: 'cylinder', a: 10, b: 10, c: 20, op: 'newbody', at: [80, 0, 0] },
  ]
  assert.ok(await g().applyFeatures(feats, 'two bodies'), g().status)
  assert.equal(g().bodyMesh.parked?.length, 1)
  const pk = g().bodyMesh.parked[0]
  const key = pk.name ? `pk:${pk.name}` : 'pk#0'
  g().setBodyHidden(key, true)
  assert.ok(g().bodyHidden.includes(key))
  assert.equal(g().status, '已隱藏實體')

  assert.ok(await g().applyFeatures([...g().features], 'rebuild with parked hidden'), g().status)
  assert.ok(g().bodyHidden.includes(key), 'parked hide survives rebuild')
  assert.equal(g().failedFeatureIds.length, 0)
  assert.ok(g().bodyMesh?.triangles?.length > 0)

  g().showAllBodies()
  assert.deepEqual(g().bodyHidden, [])
  assert.ok(await g().applyFeatures([...g().features], 'rebuild after show-all'), g().status)
  assert.equal(g().failedFeatureIds.length, 0)
  const v = await vol()
  assert.ok(Number.isFinite(v) && v > 0, `volume after show-all rebuild ${v}`)
})
