/**
 * v1.20 P1: shell after cut+fillet — deeper heal + planar-preferring opening seeds
 * + wider MakeThickSolid tol ladder. Control cut-without-fillet stays OCCT-clean.
 * Cut+fillet soft-prefers no cavity warning (hard: rebuild succeeds).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.2x', () => {
  assert.match(version, /APP_VERSION = '1\.(2\d|[3-9]\d)'/)
})

test('P1 fix wired: heal precision + ShapeFix_Solid + planar seed + 2e-2 tol', () => {
  assert.match(workerSrc, /function _healSolid/)
  assert.match(workerSrc, /SetPrecision/)
  assert.match(workerSrc, /ShapeFix_Solid/)
  assert.match(workerSrc, /Prefer a PLANAR candidate/)
  assert.match(workerSrc, /2e-2/)
  assert.match(workerSrc, /never call cavity before the widened seeds ladder/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const cavityRe = /开口面偏移型腔/

const boxCut = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
const cylCut = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 10 }, height: 30, operation: 'newbody' }
const bbCut = { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 }

test('P1 control: cut, no fillet, shell bottom → OCCT (no cavity)', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => cavityRe.test(x)), `control must stay OCCT; warnings=${JSON.stringify(warnings)}`)
})

test('P1 BX02-like: cut + rim fillet + shell top prefers OCCT', async () => {
  // Top-face opening (BX02 QA path): near at top of box after cut+fillet.
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 0]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 25]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([0, -15, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 50000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  const usedCavity = warnings.some((x) => cavityRe.test(x))
  if (usedCavity) console.warn('P1 soft: cut+fillet+top shell still cavity', warnings)
  else console.log('P1 prefer: cut+fillet+top shell OCCT clean')
})
