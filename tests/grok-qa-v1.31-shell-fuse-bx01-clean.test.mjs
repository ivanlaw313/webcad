/**
 * v1.31: BX01 LIVE path must stay CLEAN on original opening.
 * Fuse + outer/cyl-top fillet R2 + Shell t=2 on that top opening must NOT emit
 * alternate-opening / 未收敛 soft toast (incl. solid-bot paraphrase 已启用其他开口面),
 * and must NOT fall to 备用/型腔.
 *
 * Hardens v1.30: fuse pre-heal, TORUS+short CYL boss rim, broader outer fillet-trim,
 * fuse-specific Intersection/tolerance/nudge retries.
 * Keep v1.28–v1.30 contracts green (separate files).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.31+', () => {
  assert.match(version, /APP_VERSION = '1\.3[1-9]'|APP_VERSION = '1\.[4-9]\d'/)
})

test('v1.31 wiring: fuse preheal + boss rim + fuse nudges + deferred alt lids', () => {
  assert.match(workerSrc, /function _shellAdjacentBossRim/)
  assert.match(workerSrc, /function _shellFusePreheal/)
  assert.match(workerSrc, /1\.55\) v1\.31: seeds \+ TORUS \+ short CYLINDER/)
  assert.match(workerSrc, /v1\.31: fuse topology/)
  assert.match(workerSrc, /v1\.31: outer \(fuse boss\) rims/)
  assert.match(workerSrc, /function _shellAdjacentTorusRim/)
  assert.match(workerSrc, /function _shellOcctAfterOpeningFilletTrim/)
  assert.match(workerSrc, /抽壳：原开口 OCCT 未收敛，已改用其他平面开口/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const softRe = /已改用其他平面开口|已启用其他开口面|原开口 OCCT 未收敛|未收敛|备用|型腔|开口面偏移型腔|直柱型腔/

// LIVE BX01 geometry (FUSE-SHELL.md): box 60×40×20 + Ø30×25 fuse
const box = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 20, operation: 'new' }
const cyl = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 15 }, height: 25, operation: 'newbody' }
const fuse = { id: 'bb', type: 'bodyboolean', bop: 'fuse', target: 0 }

test('HARD BX01 LIVE: junction fillet R2 + shell cyl-top t=2 → no soft toast', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 2, nears: [[15, 0, 20]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 2, nears: [[0, 0, 25]], tangentChain: true, direction: 'inside' }
  const m = await w.rebuild([box, cyl, fuse, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([20, 0, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 80000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => softRe.test(x)), `v1.31 hard BX01 junction: no soft toast; warnings=${JSON.stringify(warnings)}`)
})

test('HARD BX01 LIVE: cyl-top outer fillet R2 + shell top t=2 → no soft toast', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 2, nears: [[15, 0, 25]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 2, nears: [[0, 0, 25]], tangentChain: true, direction: 'inside' }
  const m = await w.rebuild([box, cyl, fuse, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([20, 0, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 80000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => softRe.test(x)), `v1.31 hard BX01 cyl-top: no soft toast; warnings=${JSON.stringify(warnings)}`)
})

test('spot-check BX02 still CLEAN: top-rim R1 + shell top t=1.5', async () => {
  const boxCut = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
  const cylCut = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 10 }, height: 30, operation: 'newbody' }
  const bbCut = { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 }
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 25]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 25]], tangentChain: true, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => softRe.test(x)), `BX02 must stay clean; warnings=${JSON.stringify(warnings)}`)
})
