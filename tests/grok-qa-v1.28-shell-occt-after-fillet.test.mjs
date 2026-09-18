/**
 * v1.28: Shell after cut+fillet prefers true OCCT MakeThickSolid.
 * Root cause: default MakeThickSolidByJoin(Intersection=false) fails when wall
 * thickness ≥ local fillet radius (BX02 R1 + t=1.5). Fix: also try
 * Intersection=true (+ RemoveIntEdges) flag combos before cavity fallback.
 *
 * Hard: classic BX02-like cut→fillet→shell top has NO cavity soft marker.
 * Control: cut without fillet stays OCCT-clean (regression).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.28+', () => {
  assert.match(version, /APP_VERSION = '1\.2[8-9]'|APP_VERSION = '1\.[3-9]\d'/)
})

test('v1.28 wiring: MakeThickSolid Intersection/RemoveIntEdges flag combos', () => {
  assert.match(workerSrc, /v1\.28: also try Intersection\/RemoveIntEdges flag combos/)
  assert.match(workerSrc, /flagCombos/)
  assert.match(workerSrc, /flags\.intersection/)
  assert.match(workerSrc, /flags\.removeInt/)
  assert.match(workerSrc, /never call cavity before the widened seeds ladder/)
  assert.match(workerSrc, /function _shellCavityStatus/)
  assert.match(workerSrc, /抽壳完成（备用：开口面偏移型腔）/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const cavityRe = /开口面偏移型腔|直柱型腔|备用/

const boxCut = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
const cylCut = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 10 }, height: 30, operation: 'newbody' }
const bbCut = { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 }

test('control: cut, no fillet, shell bottom → OCCT (no cavity)', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => cavityRe.test(x)), `control must stay OCCT; warnings=${JSON.stringify(warnings)}`)
})

test('HARD BX02: cut + rim fillet R1 + shell top t=1.5 → OCCT (no cavity soft)', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 0]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 25]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([0, -15, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 50000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  const usedCavity = warnings.some((x) => cavityRe.test(x))
  assert.ok(!usedCavity, `v1.28 hard: expected OCCT MakeThickSolid without cavity; warnings=${JSON.stringify(warnings)}`)
})

test('HARD BX02: cut + rim fillet R1 + shell bottom t=1.5 → OCCT (no cavity soft)', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 0]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, -18, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => cavityRe.test(x)), `bottom open must stay OCCT; warnings=${JSON.stringify(warnings)}`)
})
