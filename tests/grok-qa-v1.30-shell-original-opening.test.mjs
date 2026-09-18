/**
 * v1.30: Shell prefers true OCCT on the user-selected opening face(s).
 * LIVE @1.29 soft-fell to alternate planar openings with toast
 * 「抽壳：原开口 OCCT 未收敛，已改用其他平面开口」 when the opening shared a
 * filleted rim (BX02 top-rim fillet + top open; fuse cyl-top fillet + top open).
 *
 * Fix: (1) seeds + adjacent TORUS rim before alt lids; (2) trim opening-rim
 * fillet then OCCT on remapped seed; (3) defer alt planar lids until after
 * cavity/prismatic on the original seeds.
 *
 * Hard: BX02-like top-rim+top-open AND fuse cyl-top-fillet+top-open must NOT
 * emit the alternate-opening warning when OCCT can succeed on original side.
 * Keep v1.28 / v1.29 contracts green (separate files).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.30+', () => {
  assert.match(version, /APP_VERSION = '1\.30'|APP_VERSION = '1\.[4-9]\d'/)
})

test('v1.30 wiring: torus rim expand + fillet trim + deferred alt lids', () => {
  assert.match(workerSrc, /function _shellAdjacentTorusRim/)
  assert.match(workerSrc, /function _shellOcctAfterOpeningFilletTrim/)
  assert.match(workerSrc, /v1\.30: seeds \+ adjacent TORUS rim/)
  assert.match(workerSrc, /v1\.30: trim opening-rim fillet then OCCT/)
  assert.match(workerSrc, /v1\.30: alternate planar lids AFTER cavity/)
  assert.match(workerSrc, /抽壳：原开口 OCCT 未收敛，已改用其他平面开口/)
  assert.match(workerSrc, /v1\.29: fuse\+outer-fillet singularity/)
  assert.match(workerSrc, /v1\.28: also try Intersection\/RemoveIntEdges flag combos/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const altRe = /已改用其他平面开口|已启用其他开口面|原开口 OCCT 未收敛/
const cavityRe = /开口面偏移型腔|直柱型腔|备用/

const boxCut = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
const cylCut = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 10 }, height: 30, operation: 'newbody' }
const bbCut = { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 }

test('HARD BX02 LIVE: top-rim fillet R1 + shell top t=1.5 → no alternate-opening soft', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 25]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 25]], tangentChain: true, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([0, -15, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 50000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => altRe.test(x)), `v1.30 hard BX02: no alternate-opening toast; warnings=${JSON.stringify(warnings)}`)
})

test('HARD fuse LIVE: cyl-top fillet R2 + shell top t=2 → no alternate-opening soft', async () => {
  const boxF = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 20, operation: 'new' }
  const cylF = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 15 }, height: 25, operation: 'newbody' }
  const bbF = { id: 'bb', type: 'bodyboolean', bop: 'fuse', target: 0 }
  const fillet = { id: 'f', type: 'fillet', radius: 2, nears: [[15, 0, 25]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 2, nears: [[0, 0, 25]], tangentChain: true, direction: 'inside' }
  const m = await w.rebuild([boxF, cylF, bbF, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([20, 0, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 80000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => altRe.test(x)), `v1.30 hard fuse: no alternate-opening toast; warnings=${JSON.stringify(warnings)}`)
})

test('regression: BX02 bottom-rim fillet + top open still OCCT-clean (v1.28 path)', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 0]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 25]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => altRe.test(x) || cavityRe.test(x)), `must stay clean; warnings=${JSON.stringify(warnings)}`)
})
