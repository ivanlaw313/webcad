/**
 * FISHING29: thicken t=0 and absurd oversize (e.g. 99999) must Formal-refuse
 * before commit (no silent noop / huge plate success). Normal 2 mm still works.
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
const { useApp, thickenOversizeReason, THICKEN_ABS_MAX_MM, meshBboxSize } = await import('../src/store.ts')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')

const g = () => useApp.getState()
const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

test('thickenOversizeReason: relative to bbox catches 99999; 2 mm ok; abs ceiling', () => {
  const mesh = { vertices: new Float32Array([0, 0, 0, 40, 0, 0, 40, 30, 0, 0, 30, 0, 0, 0, 10, 40, 0, 10, 40, 30, 10, 0, 30, 10]) }
  assert.equal(thickenOversizeReason(mesh, 2), null)
  const huge = thickenOversizeReason(mesh, 99999)
  assert.ok(huge && /過大/.test(huge) && /加厚厚度/.test(huge), huge)
  assert.ok(THICKEN_ABS_MAX_MM >= 100000)
  // No mesh → only absolute ceiling applies
  assert.equal(thickenOversizeReason(null, 2), null)
  assert.match(thickenOversizeReason(null, THICKEN_ABS_MAX_MM + 1) || '', /超過上限/)
  const sz = meshBboxSize(mesh)
  assert.ok(sz && Math.abs(sz[0] - 40) < 1e-6)
})

test('commitThicken refuses t=0 with Formal TC; features unchanged', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const before = { features: structuredClone(g().features), undo: g().undoStack.length, parked: g().bodyMesh?.parked?.length ?? 0 }
  g().toggleThicken()
  await g().thickenFaceAt([20, 10, -15])
  g().setThicken({ thick: 0 })
  assert.equal(g().thickenThick, 0)
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /厚度必須大於 0/)
  await g().commitThicken()
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /厚度必須大於 0/)
  assert.equal(g().thickenMode, true, 'stay in thicken after refuse')
  assert.deepEqual(g().features, before.features)
  assert.equal(g().undoStack.length, before.undo)
  assert.equal(g().bodyMesh?.parked?.length ?? 0, before.parked)
})

test('commitThicken refuses absurd 99999 with Formal TC; no silent success', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const before = { features: structuredClone(g().features), undo: g().undoStack.length, parked: g().bodyMesh?.parked?.length ?? 0 }
  g().toggleThicken()
  await g().thickenFaceAt([20, 10, -15])
  g().setThicken({ thick: 99999 })
  assert.equal(g().thickenThick, 99999)
  await g().commitThicken()
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /過大|超過上限/)
  assert.equal(g().thickenMode, true, 'stay in thicken after oversize refuse')
  assert.deepEqual(g().features, before.features)
  assert.equal(g().undoStack.length, before.undo)
  assert.equal(g().bodyMesh?.parked?.length ?? 0, before.parked)
  assert.doesNotMatch(g().status, /已加厚/)
})

test('commitThicken normal 2 mm still works', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  g().toggleThicken()
  await g().thickenFaceAt([20, 10, -15])
  g().setThicken({ thick: 2 })
  await g().commitThicken()
  assert.equal(g().thickenMode, false, g().status)
  const f = g().features.find((x) => x.type === 'thickenface')
  assert.ok(f)
  assert.equal(f.thick, 2)
  assert.match(g().status, /已加厚/)
  assert.ok((g().bodyMesh?.parked?.length ?? 0) >= 1)
})

test('store source gates oversize before applyFeatures', () => {
  const st = rd('src/store.ts')
  assert.match(st, /thickenOversizeReason/)
  assert.match(st, /THICKEN_ABS_MAX_MM/)
  const commit = st.slice(st.indexOf('commitThicken: async'), st.indexOf('commitThicken: async') + 900)
  assert.match(commit, /illegalRejectStatus\('加厚厚度必須大於 0'\)/)
  assert.match(commit, /thickenOversizeReason\(s\.bodyMesh, s\.thickenThick\)/)
  assert.match(commit, /illegalRejectStatus\(over\)/)
})
