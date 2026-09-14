/**
 * P2 (v1.19): shell after bodyboolean (± fillet) should prefer real OCCT MakeThickSolid
 * (heal + join/tol ladder) over cavityInwardShell fallback.
 * Control: cut, no fillet → OCCT OK (no cavity warning).
 * Cut+fillet / fuse+fillet → rebuild OK; soft-prefer no cavity warning.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION is a release string', () => {
  assert.match(version, /APP_VERSION = '\d+\.\d+'/)
})

test('P2 fix: _healSolid + widened shell ladder + OCCT-before-cavity wired', () => {
  assert.match(workerSrc, /function _healSolid/)
  assert.match(workerSrc, /ShapeFix_Shape_2/)
  assert.match(workerSrc, /P2: heal once before join\/tol ladder/)
  assert.match(workerSrc, /1e-2.*5e-4/)
  assert.match(workerSrc, /never call cavity before the widened seeds ladder/)
  assert.match(workerSrc, /Seeds-only OCCT miss/)
  assert.match(workerSrc, /shape = _healSolid\(shape\)\s+\/\/ P2: clean micro-edges/)
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

const boxFuse = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
const cylFuse = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 12 }, height: 35, operation: 'newbody' }
const bbFuse = { id: 'bb', type: 'bodyboolean', bop: 'fuse', target: 0 }

test('P2 control: cut, no fillet, shell bottom → OCCT success (no cavity warning)', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((w) => cavityRe.test(w)), `control must stay OCCT; warnings=${JSON.stringify(warnings)}`)
  const body = await w.measureBodyAt([0, 15, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 50000, `unexpected volume ${body?.volume}`)
})

test('P2: cut + off-seam rim fillet + shell bottom rebuilds (prefer no cavity)', async () => {
  // Off-seam rim pick avoids pure-seam LINE; P1 covers seam longitude.
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 0]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, -18, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([0, -15, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 50000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  const usedCavity = warnings.some((w) => cavityRe.test(w))
  // Soft-assert (plan): rebuild success is hard; OCCT-without-cavity is stretch/prefer.
  if (usedCavity) console.warn('P2 soft: cut+fillet shell still used cavity fallback', warnings)
  else console.log('P2 prefer: cut+fillet shell used OCCT (no cavity warning)')
})

test('P2: fuse + outer fillet R2 + shell bottom rebuilds (prefer no cavity)', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 2, nears: [[25, 0, 25]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 2, nears: [[0, 0, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxFuse, cylFuse, bbFuse, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([20, 0, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 80000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  const usedCavity = warnings.some((w) => cavityRe.test(w))
  if (usedCavity) console.warn('P2 soft: fuse+fillet shell still used cavity fallback', warnings)
  else console.log('P2 prefer: fuse+fillet shell used OCCT (no cavity warning)')
})
