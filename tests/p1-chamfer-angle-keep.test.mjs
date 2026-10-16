/**
 * FISHING31-recheck2 P1：倒角「距離＋角度」打 120° 唔准靜默夾返 90／清空。
 * 政策 BUG-409：typed value 原樣入 store／UI；chamferInputReason 仍拒 0/90/120；確定灰。
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
const { useApp, chamferInputReason } = await import('../src/store.ts')
const g = () => useApp.getState()
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

test('setChamferAngle(120) keeps 120 (no silent clamp to 90)', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  g().setChamferAngle(120)
  assert.equal(g().chamferAngle, 120)
  g().setChamferAngle(0)
  assert.equal(g().chamferAngle, 0)
  g().setChamferAngle(90)
  assert.equal(g().chamferAngle, 90)
  g().setChamferAngle(45)
  assert.equal(g().chamferAngle, 45)
  g().setChamferAngle(NaN)
  assert.equal(g().chamferAngle, 45, 'non-finite falls back to 45')
})

test('chamferInputReason rejects 120 / 0 / 90; accepts 45', () => {
  const box = { vertices: [0, 0, 0, 40, 30, 10] }
  assert.match(chamferInputReason({ edgeRoundSize: 2, chamferMode: 'angle', chamferAngle: 120, bodyMesh: box }), /角度必須大於 0° 以及小於 90°/)
  assert.match(chamferInputReason({ edgeRoundSize: 2, chamferMode: 'angle', chamferAngle: 0, bodyMesh: box }), /角度必須大於 0° 以及小於 90°/)
  assert.match(chamferInputReason({ edgeRoundSize: 2, chamferMode: 'angle', chamferAngle: 90, bodyMesh: box }), /角度必須大於 0° 以及小於 90°/)
  assert.equal(chamferInputReason({ edgeRoundSize: 2, chamferMode: 'angle', chamferAngle: 45, bodyMesh: box }), null)
})

test('Viewport chamfer angle NumInput has no max={90} (typed 120 reaches store)', () => {
  const vp = src('components/Viewport.tsx')
  const m = vp.match(/NumInput value=\{chamferAngle\}[^>]*>/)
  assert.ok(m, 'chamferAngle NumInput present')
  assert.doesNotMatch(m[0], /max=\{90\}/, `must not clamp display/draft at 90: ${m[0]}`)
  assert.match(m[0], /onValue=\{setChamferAngle\}/)
})

test('setChamferAngle source does not Math.min(90)/Math.max(0) clamp', () => {
  const store = src('store.ts')
  // Prefer the implementation (after type decl); look for the body that writes chamferAngle.
  const start = store.indexOf('setChamferAngle: (n) =>')
  assert.ok(start > 0, 'implementation setChamferAngle not found')
  const block = store.slice(start, store.indexOf('\n  setChamferReferenceFace:', start))
  assert.doesNotMatch(block, /Math\.min\(90/)
  assert.doesNotMatch(block, /Math\.max\(0,\s*n\)/)
  assert.match(block, /Number\.isFinite\(n\)\s*\?\s*n\s*:\s*45/)
})

test('drag path still clamps via chamferAngleFromDrag (UX)', () => {
  const drag = src('cad/chamferDrag.ts')
  assert.match(drag, /Math\.min\(90,\s*Math\.max\(0/)
})
