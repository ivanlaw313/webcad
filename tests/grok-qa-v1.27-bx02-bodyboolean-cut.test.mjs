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
  const m = version.match(/APP_VERSION = '(\d+)\.(\d+)'/)
  assert.ok(m, 'APP_VERSION missing')
  const major = Number(m[1]), minor = Number(m[2])
  assert.ok(major > 1 || (major === 1 && minor >= 27), `expected >= 1.27, got ${m[1]}.${m[2]}`)
})

test('BX02 v1.27: heal + _cutRobust + auto-swap wired in bodyboolean', () => {
  assert.match(workerSrc, /function _cutRobust/)
  assert.match(workerSrc, /function _solidVolume/)
  assert.match(workerSrc, /已自動對調為工具−目標/)
  assert.match(workerSrc, /const targetSh = _healSolid\(shape\)/)
  assert.match(workerSrc, /const toolSh = _healSolid\(t\.shape\)/)
  assert.match(workerSrc, /v1\.27 BX02/)
})

test('BX02 v1.27: box/cylinder dialog expose ⬡新實體 op', () => {
  // UX3 #2: default op is auto (overlap → newbody); explicit ⬡新實體 still on PrimOpSelect
  assert.match(storeSrc, /box: \{ l: 80, w: 60, h: 40, op: 'auto'/)
  assert.match(storeSrc, /cylinder: \{ d: 60, h: 50, op: 'auto'/)
  assert.match(storeSrc, /BX02 \/ ASM2 P1：cylinder op=newbody/)
  assert.match(viewportSrc, /function PrimOpSelect/)
  assert.match(viewportSrc, /value="newbody"/)
  assert.match(viewportSrc, /featDlg\.kind === 'box'[\s\S]*?PrimOpSelect/)
  assert.match(viewportSrc, /featDlg\.kind === 'cylinder'[\s\S]*?PrimOpSelect/)
  assert.match(viewportSrc, /BX02：先長方體，再圓柱選「⬡新實體」/)
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
  assert.ok(warnings.some((w) => /自动对调|自動對調/.test(w)), `expected auto-swap warning, got ${JSON.stringify(warnings)}`)
  const body = await w.measureBodyAt([5, 5, 5])
  assert.ok(body && body.volume > 10000 && body.volume < 50000, `expected holed-box volume, got ${body?.volume}`)
})

test('BX02 control: cyl op=newbody becomes active (ASM2 P1); keep box active via type:newbody then cyl', async () => {
  // ASM2 P1：operation=newbody 令新建體成活動體。要「箱仍為活動、圓柱為工具」須用 type:newbody 先泊箱。
  const park = { id: 'park', type: 'newbody', name: '實體1' }
  const cyl = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [25, 20], r: 10 }, height: 30, operation: 'new' }
  const m = await w.rebuild([boxCorner, park, cyl, cut])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
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
  // ASM2 P1：far cyl 成活動體；box 爲獨立實體。bodyboolean cut 以獨立實體#0（箱）切活動圓柱 — 不相交 → 圓柱體積不變。
  assert.equal(m.parked?.length, 1)
  const body = await w.measureBodyAt([200, 200, 12])
  assert.ok(body && body.volume > 8000 && body.volume < 12000, `far cylinder volume ${body?.volume}`)
})
