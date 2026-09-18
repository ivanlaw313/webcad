/**
 * v1.29: Shell after fuse+outer-fillet prefers true OCCT MakeThickSolid.
 * Root cause: when wall thickness equals local outer fillet radius (t===R),
 * MakeThickSolidByJoin self-intersects exactly (t=1.99 and t=2.01 succeed;
 * t=2.0 soft-falls to cavity). v1.28 Intersection flags fix cut+fillet t≥R
 * but not this exact-equality fuse+outer case; SelfInter flags do not help.
 * Fix: after exact-thickness ladder fails, retry with tiny thickness nudges
 * (±1e-4..1e-2) before cavity fallback.
 *
 * Hard: fuse → outer fillet R2 → shell t=2 (bottom/top) → NO cavity soft marker.
 * Regression: keep v1.28 BX02 cut+fillet+shell OCCT-clean (separate test file).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.29+', () => {
  assert.match(version, /APP_VERSION = '1\.29'|APP_VERSION = '1\.[3-9]\d'/)
})

test('v1.29 wiring: thickness-nudge retry after exact MakeThickSolid miss', () => {
  assert.match(workerSrc, /v1\.29: fuse\+outer-fillet singularity when \|thickness\| equals local fillet radius/)
  assert.match(workerSrc, /nudgeEps/)
  assert.match(workerSrc, /const nudged = signedThickness/)
  assert.match(workerSrc, /v1\.28: also try Intersection\/RemoveIntEdges flag combos/)
  assert.match(workerSrc, /function _shellCavityStatus/)
  assert.match(workerSrc, /抽壳完成（备用：.+型腔）/)
  assert.match(workerSrc, /never call cavity before the widened seeds ladder/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const cavityRe = /开口面偏移型腔|直柱型腔|备用/

const boxFuse = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
const cylFuse = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 12 }, height: 35, operation: 'newbody' }
const bbFuse = { id: 'bb', type: 'bodyboolean', bop: 'fuse', target: 0 }
const outerFilletR2 = { id: 'f', type: 'fillet', radius: 2, nears: [[25, 0, 25]], chain: false }

test('control: fuse, no fillet, shell bottom t=2 → OCCT (no cavity)', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 2, nears: [[0, 0, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxFuse, cylFuse, bbFuse, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => cavityRe.test(x)), `control must stay OCCT; warnings=${JSON.stringify(warnings)}`)
})

test('HARD fuse+outer R2 + shell bottom t=2 (=R) → OCCT (no cavity soft)', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 2, nears: [[0, 0, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxFuse, cylFuse, bbFuse, outerFilletR2, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([20, 0, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 80000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => cavityRe.test(x)), `v1.29 hard: expected OCCT without cavity; warnings=${JSON.stringify(warnings)}`)
})

test('HARD fuse+outer R2 + shell top t=2 (=R) → OCCT (no cavity soft)', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 2, nears: [[0, 0, 35]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxFuse, cylFuse, bbFuse, outerFilletR2, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => cavityRe.test(x)), `top open must stay OCCT; warnings=${JSON.stringify(warnings)}`)
})

test('fuse+outer R2 + shell bottom t=1.5 (<R) still OCCT', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxFuse, cylFuse, bbFuse, outerFilletR2, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok(!((m.warnings ?? []).some((x) => cavityRe.test(x))), `t<R must stay OCCT; warnings=${JSON.stringify(m.warnings)}`)
})
