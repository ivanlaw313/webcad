/**
 * BX02 (LIVE v1.26 PARTIAL): multi-body Boolean CUT rebuild failure after「新实体」.
 * Setup that failed: box → newbody feature (park box) → contained cylinder (active) →
 * combine cut (target−tool = cyl−box) → zero volume → applyFeatures toast
 * 「重建失败 - 已保留一个有效模型…」.
 * v1.27: heal operands + _cutRobust + auto-swap when reverse cut has volume;
 * box/cylinder dialogs expose ⬡新實體 so tool can park while target stays active.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewportSrc = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.27+', () => {
  assert.match(version, /APP_VERSION = '1\.(2[7-9]|[3-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('BX02 v1.27: heal + _cutRobust + auto-swap wired in bodyboolean', () => {
  assert.match(workerSrc, /function _cutRobust/)
  assert.match(workerSrc, /function _solidVolume/)
  assert.match(workerSrc, /已自动对调为工具−目标/)
  assert.match(workerSrc, /const targetSh = _healSolid\(shape\)/)
  assert.match(workerSrc, /const toolSh = _healSolid\(t\.shape\)/)
  assert.match(workerSrc, /v1\.27 BX02/)
})

test('BX02 v1.27: box/cylinder dialog expose ⬡新實體 op', () => {
  assert.match(storeSrc, /box: \{ l: 80, w: 60, h: 40, op: 'new' \}/)
  assert.match(storeSrc, /cylinder: \{ d: 60, h: 50, op: 'new' \}/)
  assert.match(storeSrc, /BX02: box active \+ cylinder op=newbody/)
  assert.match(viewportSrc, /featDlg\.kind === 'box'[\s\S]*?⬡新實體/)
  assert.match(viewportSrc, /featDlg\.kind === 'cylinder'[\s\S]*?⬡新實體/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const boxCorner = { id: 'box', type: 'prim', shape: 'box', a: 50, b: 40, c: 25, op: 'new', cornerOrigin: true }
const cylAtCenter = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [25, 20], r: 10 }, height: 25, operation: 'new' }
const park = { id: 'nb', type: 'newbody', name: '实体1' }
const cut = { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 }

test('BX02 LIVE-fail path: box→新实体→contained cyl→cut now rebuilds (auto-swap)', async () => {
  const m = await w.rebuild([boxCorner, park, cylAtCenter, cut])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(warnings.some((w) => /自动对调/.test(w)), `expected auto-swap warning, got ${JSON.stringify(warnings)}`)
  const body = await w.measureBodyAt([5, 5, 5])
  assert.ok(body && body.volume > 10000 && body.volume < 50000, `expected holed-box volume, got ${body?.volume}`)
})

test('BX02 control: box active + cyl op=newbody cut (no swap needed)', async () => {
  const cylPark = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [25, 20], r: 10 }, height: 30, operation: 'newbody' }
  const m = await w.rebuild([boxCorner, cylPark, cut])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((w) => /自动对调/.test(w)), `control must not auto-swap: ${JSON.stringify(warnings)}`)
})

test('BX02 classic extrude path still rebuilds', async () => {
  const box = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
  const cyl = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 10 }, height: 30, operation: 'newbody' }
  const m = await w.rebuild([box, cyl, cut])
  assert.deepEqual(m.failed ?? [], [])
  assert.ok((m.triangles?.length ?? 0) > 0)
})

test('BX02: non-overlapping cut stays honest (no false swap)', async () => {
  const far = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [200, 200], r: 10 }, height: 30, operation: 'newbody' }
  const m = await w.rebuild([boxCorner, far, cut])
  assert.deepEqual(m.failed ?? [], [])
  // box unchanged-ish volume (~50000); far tool consumed with no material removed
  const body = await w.measureBodyAt([25, 20, 12])
  assert.ok(body && body.volume > 40000, `unexpected volume ${body?.volume}`)
})
