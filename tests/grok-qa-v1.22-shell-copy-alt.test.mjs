/**
 * v1.22 P1: shell after cut+fillet — copy+aggressive heal, alternate planar openings
 * before cavity; softer cavity status (no 「失败」). Control stays OCCT-clean.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.22+ (superseded by later ship)', () => {
  assert.match(version, /APP_VERSION = '1\.(2[2-9]|[3-9]\d)'/)
})

test('P1 shell wiring: copy-heal + alt openings + soft cavity status', () => {
  assert.match(workerSrc, /function _copyHealSolid/)
  assert.match(workerSrc, /BRepBuilderAPI_Copy/)
  assert.match(workerSrc, /function _shellCavityStatus/)
  assert.match(workerSrc, /抽殼完成（备用重建/)
  assert.doesNotMatch(workerSrc, /OCCT 抽壳失败/)
  assert.match(workerSrc, /altOpenings/)
  assert.match(workerSrc, /alternate planar lids \(NOT G1 chain\) before cavity/)
  assert.match(workerSrc, /自动改用其他平面开口完成/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const cavityRe = /开口面偏移型腔|备用重建/
const failAlarmRe = /OCCT 抽壳失败|抽壳失败/

const boxCut = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
const cylCut = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 10 }, height: 30, operation: 'newbody' }
const bbCut = { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 }

test('P1 control: cut, no fillet, shell bottom → OCCT (no cavity)', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => /备用重建|开口面偏移型腔/.test(x)), `control must stay OCCT; warnings=${JSON.stringify(warnings)}`)
})

test('P1 BX02-like: cut + rim fillet + shell — rebuild OK; soft prefer OCCT; cavity soft-worded', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 0]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 25]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([0, -15, 1])
  assert.ok(body && body.volume > 2000 && body.volume < 50000, `unexpected volume ${body?.volume}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => failAlarmRe.test(x)), `cavity path must not alarm with 失败; warnings=${JSON.stringify(warnings)}`)
  const usedCavity = warnings.some((x) => cavityRe.test(x))
  if (usedCavity) console.warn('P1 soft: cut+fillet+top shell still cavity (soft wording)', warnings)
  else console.log('P1 prefer: cut+fillet+top shell OCCT clean')
})

test('CX02-like regression: through-cut + rim fillet + shell bottom rebuilds', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 0]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, -18, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => failAlarmRe.test(x)), `no 失败 alarm; warnings=${JSON.stringify(warnings)}`)
})
