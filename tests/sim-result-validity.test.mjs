/** Pure helper coverage for src/simulation/resultValidity.ts (SIM stale). */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./ts-resolver.mjs', import.meta.url)
const {
  feaPhysicsOptChanged,
  hasLiveSimResults,
  invalidateSimResultsPatch,
} = await import('../src/simulation/resultValidity.ts')

test('physics opt change detects Fixed→Roller but ignores display field', () => {
  assert.equal(feaPhysicsOptChanged({ feaFixMode: 'fixed' }, { feaFixMode: 'roller' }), true)
  assert.equal(feaPhysicsOptChanged({ feaFixMode: 'fixed' }, { feaField: 'disp' }), false)
})

test('invalidate patch clears overlays and marks 失效', () => {
  const p = invalidateSimResultsPatch('約束／工況已改')
  assert.equal(p.feaResult, null)
  assert.equal(p.feaStale, true)
  assert.match(p.status, /失效/)
  assert.equal(hasLiveSimResults({ feaResult: { x: 1 } }), true)
  assert.equal(hasLiveSimResults({ feaResult: null, moldResult: null }), false)
})
