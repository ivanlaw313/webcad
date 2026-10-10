// Real OCCT: dual-distance chamfer must remove ½·d1·d2·L (not equal d1²). No silent equal fallback.
// Run: nice -n 19 node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/chamfer-two-distance-kernel.test.mjs
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

const g = () => useApp.getState()
const vol = (m) => {
  const t = m.triangles, p = m.vertices
  let v = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  }
  return Math.abs(v) / 6
}
const near = (a, b, e = 1) => Math.abs(a - b) < e

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 40, c: 40, op: 'new', cornerOrigin: true }
// Top front edge mid (cornerOrigin): x=20, y=0, z=40
const TOP_FRONT = [[20, 0, 40]]

test('dual-distance C3×8 on top edge is truly asymmetric (vol ≠ equal C3)', async () => {
  assert.ok(await g().applyFeatures([BOX], 'box'))
  const V0 = vol(g().bodyMesh)
  assert.ok(near(V0, 64000, 1), `box vol ${V0}`)

  assert.ok(await g().applyFeatures([BOX, { id: 'ce', type: 'chamfer', distance: 3, nears: TOP_FRONT, cmode: 'equal', chain: false }], 'eq'))
  const Ve = vol(g().bodyMesh)
  // ½·3·3·40 = 180 → 63820
  assert.ok(near(Ve, 64000 - 180, 5), `equal C3 vol ${Ve}`)

  assert.ok(await g().applyFeatures([BOX, { id: 'ct', type: 'chamfer', distance: 3, dist2: 8, nears: TOP_FRONT, cmode: 'two', chain: false, flip: false }], 'two'))
  const Vt = vol(g().bodyMesh)
  // ½·3·8·40 = 480 → 63520
  assert.ok(near(Vt, 64000 - 480, 8), `two C3×8 vol ${Vt}`)
  assert.ok(Math.abs(Vt - Ve) > 200, `asymmetric must differ from equal: ${Vt} vs ${Ve}`)

  // Flip rebuilds successfully (90° → same volume)
  assert.ok(await g().applyFeatures([BOX, { id: 'cf', type: 'chamfer', distance: 3, dist2: 8, nears: TOP_FRONT, cmode: 'two', chain: false, flip: true }], 'flip'))
  assert.ok(near(vol(g().bodyMesh), Vt, 8))

  // Timeline edit: change dist2 8→5 and volume must follow ½·3·5·40=300 → 63700
  assert.ok(await g().applyFeatures([BOX, { id: 'ct', type: 'chamfer', distance: 3, dist2: 8, nears: TOP_FRONT, cmode: 'two', chain: false }], 'two2'))
  await g().editFeature('ct', { distance: 3, cmode: 'two', dist2: 5, flip: false, chain: false })
  const Ved = vol(g().bodyMesh)
  assert.ok(near(Ved, 64000 - 300, 8), `edit dist2→5 vol ${Ved}`)
  assert.equal(g().features.find((f) => f.id === 'ct').dist2, 5)
  assert.equal(g().features.find((f) => f.id === 'ct').cmode, 'two')
})

test('oversized dual-distance refuses with Traditional reason (no silent equal)', async () => {
  assert.ok(await g().applyFeatures([BOX], 'box'))
  const V0 = vol(g().bodyMesh)
  const ok = await g().applyFeatures([BOX, { id: 'bad', type: 'chamfer', distance: 50, dist2: 50, nears: TOP_FRONT, cmode: 'two', chain: false }], 'bad', true, '雙距離失敗')
  assert.equal(ok, false)
  assert.ok(near(vol(g().bodyMesh), V0, 1), 'model unchanged after refuse')
  const status = g().status || ''
  const err = Object.values(g().featureErrors || {})[0] || ''
  assert.ok(/雙距離|倒角失敗|太大|幾何|失敗|未能/.test(status + err), `Traditional refuse: status=${status} err=${err}`)
  // Must not have become an equal-distance chamfer feature
  assert.ok(!g().features.some((f) => f.type === 'chamfer' && f.cmode === 'equal' && f.id === 'bad'))
})
