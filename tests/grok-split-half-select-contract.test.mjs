/**
 * SO10 / BUG-SO15-002 (v1.5): after split, parked/low half must be pickable in
 * viewport + browser tree and measurable via measureBodyAt / body filter.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('BUG-SO15-002: ParkedBody is pickable during measureUniMode / body select', () => {
  assert.match(viewport, /pickable=\{editPolesMode \|\| quiltPickMode \|\| measureUniMode \|\| \(mode === 'model' && !formMode && selPicksBody\(selFilter\)\)\}/)
  assert.match(viewport, /if \(measureUniMode\) \{ useApp\.getState\(\)\.selectParkedBody\(idx\); void useApp\.getState\(\)\.pickMeasureUniAt\(threePt/)
  assert.match(viewport, /selectedParkedIndex === i/)
})

test('BUG-SO15-002: browser tree parked leaves are selectable and measurable', () => {
  assert.match(tree, /selectedParkedIndex/)
  assert.match(tree, /st\.selectParkedBody\(i\)/)
  assert.match(tree, /st\.measureParkedBody\(i\)/)
  assert.match(tree, /openPropertiesDialog\(`parked:\$\{i\}`\)/)
})

test('BUG-SO15-002: store exposes select/measure parked APIs + properties parked:N', () => {
  assert.match(store, /selectedParkedIndex: number \| null/)
  assert.match(store, /selectParkedBody: \(idx: number \| null\) => void/)
  assert.match(store, /measureParkedBody: \(idx: number\) => Promise<void>/)
  assert.match(store, /bodyId\.startsWith\('parked:'\)/)
  assert.match(store, /cad\.measureBodyAt\(cp\)/)
})

test('BUG-SO15-002: measureBodyAt still returns 3000 for parked lo half after X=15 split', async () => {
  globalThis.require = createRequire(import.meta.url)
  globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
  register('./native-car-loader.mjs', import.meta.url)
  await import('../src/worker/cad.worker.ts')
  const worker = globalThis.__wheelWorker
  await worker.ready()
  const box = { id: 'b', type: 'prim', shape: 'box', a: 40, b: 20, c: 10, op: 'new', cornerOrigin: true }
  const split = { id: 's', type: 'split', axis: 'X', offset: 15, keep: 'hi', nameA: '分割A', nameB: '分割B' }
  const mesh = await worker.rebuild([box, split])
  assert.ok(mesh.parked?.length >= 1)
  const lo = await worker.measureBodyAt([7, 10, 5])
  const hi = await worker.measureBodyAt([30, 10, 5])
  assert.ok(lo); assert.ok(hi)
  assert.ok(Math.abs(lo.volume - 3000) < 1e-3, `lo volume ${lo.volume}`)
  assert.ok(Math.abs(hi.volume - 5000) < 1e-3, `hi volume ${hi.volume}`)
})
