/**
 * BX02 (LIVE v1.18 PARTIAL): multi-body Boolean CUT then fillet cut-rim at R1.
 * Seam longitude on a cylindrical cut rim used to resolve to the OCCT face seam
 * LINE (dmin tie) → fillet rebuild failure; outer edges / off-seam rim OK.
 * v1.19: prefer closed/CIRCLE over open LINE when near-distances tie.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.19', () => {
  assert.match(version, /APP_VERSION = '1\.19'/)
})

test('BX02 fix: seam-aware near-edge rank wired', () => {
  assert.match(workerSrc, /function _edgePickRank/)
  assert.match(workerSrc, /function _nearEdgeBetter/)
  assert.match(workerSrc, /Prefer closed\/circular edges over/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const box = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
const cyl = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 10 }, height: 30, operation: 'newbody' }
const cut = { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 }

test('BX02: bodyboolean cut alone rebuilds', async () => {
  const m = await w.rebuild([box, cyl, cut])
  assert.deepEqual(m.failed ?? [], [])
  assert.ok((m.triangles?.length ?? 0) > 0)
})

test('BX02: cut-rim R1 at seam longitude (bottom) succeeds', async () => {
  // Seam of extruded circle is at +X local → world [20,0,*]. Pre-fix this picked LINE seam.
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 0, 0]], chain: false }
  const m = await w.rebuild([box, cyl, cut, fillet])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const e = await w.measureEdgeAt([20, 0, 0])
  // After fillet the rim is blended; before fillet measure on cut-only:
  const m0 = await w.rebuild([box, cyl, cut])
  assert.deepEqual(m0.failed ?? [], [])
  const e0 = await w.measureEdgeAt([20, 0, 0])
  assert.ok(e0 && /circle/i.test(e0.kind), `seam longitude must resolve to CIRCLE rim, got ${JSON.stringify(e0)}`)
})

test('BX02: cut-rim R1 at seam longitude (top) succeeds', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 0, 25]], chain: false }
  const m = await w.rebuild([box, cyl, cut, fillet])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
})

test('BX02: outer edge R1 still succeeds (control)', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[25, 0, 25]], chain: false }
  const m = await w.rebuild([box, cyl, cut, fillet])
  assert.deepEqual(m.failed ?? [], [])
})

test('BX02: vertical seam LINE itself still fails honestly (not a solid rim)', async () => {
  // Mid-height on the seam is far from both rims; nearest edge is the seam LINE.
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 0, 12.5]], chain: false }
  const m = await w.rebuild([box, cyl, cut, fillet])
  assert.ok((m.failed ?? []).some((f) => f.id === 'f'), 'filleting pure seam mid should still fail')
})
