/**
 * CORE16 / P1: circle-pipe (default Ø) and circle sketch profile + twist≠0
 * must produce a solid with volume ≈ untwisted baseline (twist is a visual no-op
 * on a circle; MakePipeShell multi-section seam twist previously collapsed vol≈0).
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
const { useApp } = await import('../src/store.ts')

const g = () => useApp.getState()
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

test('source: circular sweep profiles force effTwist=0 (no multi-section seam twist)', () => {
  const w = rd('src/worker/cad.worker.ts')
  assert.match(w, /circPipe/)
  assert.match(w, /effTwist/)
  assert.match(w, /circPipe \? 0 : swTwist/)
  assert.match(w, /circPipe3 \? 0 : swTwist/)
  // Volume gate rethrow must match Formal TC body (不能套用扭轉), not stale 扭轉掃掠 prefix
  assert.match(w, /e\.message\.startsWith\('不能套用扭轉'\)/)
  assert.doesNotMatch(w, /e\.message\.startsWith\('扭轉掃掠'\)/)
})

async function volOf(feat) {
  reset()
  assert.equal(await g().applyFeatures([feat], 'sweep'), true, g().status)
  const v = g().bodyMesh?.volumeExact
  assert.ok(Number.isFinite(v) && v > 1e-6, `expected solid volume, got ${v}; status=${g().status}`)
  return v
}

test('runtime: circle-pipe twist90 volume ≈ twist0 (±10%)', async () => {
  const path = [[0, 0], [80, 0]]
  const v0 = await volOf({ id: 'sw0', type: 'sweep', r: 5, op: 'new', path, twist: 0 })
  const v90 = await volOf({ id: 'sw90', type: 'sweep', r: 5, op: 'new', path, twist: 90 })
  const v180 = await volOf({ id: 'sw180', type: 'sweep', r: 5, op: 'new', path, twist: 180 })
  // π·5²·80 ≈ 6283
  assert.ok(Math.abs(v0 - Math.PI * 25 * 80) / v0 < 0.05, `baseline ${v0}`)
  assert.ok(Math.abs(v90 - v0) / v0 <= 0.1, `twist90 ${v90} vs twist0 ${v0}`)
  assert.ok(Math.abs(v180 - v0) / v0 <= 0.1, `twist180 ${v180} vs twist0 ${v0}`)
})

test('runtime: circle sketch-profile twist90 volume ≈ twist0 (±10%)', async () => {
  const path = [[0, 0], [80, 0]]
  const prof = { kind: 'circle', c: [0, 0], r: 5 }
  const v0 = await volOf({ id: 'sw0', type: 'sweep', r: 5, op: 'new', path, profile: prof, twist: 0 })
  const v90 = await volOf({ id: 'sw90', type: 'sweep', r: 5, op: 'new', path, profile: prof, twist: 90 })
  assert.ok(Math.abs(v90 - v0) / v0 <= 0.1, `circ profile twist90 ${v90} vs ${v0}`)
})

test('runtime: circle-pipe L-path twist90 volume ≈ twist0 (no auto-fillet warn; twist no-op)', async () => {
  const path = [[0, 0], [60, 0], [60, 40]]
  const v0 = await volOf({ id: 'sw0', type: 'sweep', r: 5, op: 'new', path, twist: 0 })
  const v90 = await volOf({ id: 'sw90', type: 'sweep', r: 5, op: 'new', path, twist: 90 })
  // Circle-pipe must not emit sharp-path auto-fillet warn (effTwist=0 → plain path)
  assert.doesNotMatch(g().status, /自動圓角/)
  assert.ok(Math.abs(v90 - v0) / v0 <= 0.1, `L-path pipe twist90 ${v90} vs ${v0}`)
})

test('runtime: rect twist90 still ≈ twist0 (non-circle path unchanged)', async () => {
  const path = [[0, 0], [80, 0]]
  const prof = { kind: 'rect', a: [-5, -5], b: [5, 5] }
  const v0 = await volOf({ id: 'sw0', type: 'sweep', r: 5, op: 'new', path, profile: prof, twist: 0 })
  const v90 = await volOf({ id: 'sw90', type: 'sweep', r: 5, op: 'new', path, profile: prof, twist: 90 })
  assert.ok(Math.abs(v90 - v0) / v0 <= 0.1, `rect twist90 ${v90} vs ${v0}`)
})
