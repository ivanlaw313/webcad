/**
 * CORE16 residual more19: Revolve cut / groove (切割/車槽).
 * API exists: addRevolve(..., op='cut'), Timeline op「切割(車槽)」, Viewport featDlg,
 * worker boolean cut path. Complements revolve-intersect-so04 (kernel cut wedge) with
 * store applyFeatures + addRevolve status Formal TC + volume ↓. No product fix.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))
const near = (a, b, t = 1) => Math.abs(a - b) < t
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /切割\(车槽\)|已旋转切割/

const PLATE = {
  id: 'plate',
  type: 'extrude',
  profile: { kind: 'rect', a: [-30, -20], b: [30, 20] },
  height: 10,
  operation: 'new',
}
/** Groove-like profile offset from Y axis — revolve-cut removes a torus-slice wedge. */
const GROOVE_PROF = { kind: 'rect', a: [8, -10], b: [28, 10] }

test('source: revolve cut / 車槽 API + Formal TC labels (Timeline / Viewport / addRevolve)', () => {
  const st = rd('src/store.ts')
  const tl = rd('src/components/Timeline.tsx')
  const vp = rd('src/components/Viewport.tsx')
  const worker = rd('src/worker/cad.worker.ts')

  assert.match(st, /addRevolve:\s*async\s*\(profile/)
  assert.match(st, /op === 'cut' \? '切割（車槽）'/)
  assert.match(st, /revOp: BoolOp = \(rawOp === 'cut'/)
  assert.match(tl, /value: 'cut', label: '切割\(車槽\)'/)
  assert.match(vp, /value="cut">\{tStatus\('－切割\(車槽\)'/)
  assert.match(worker, /f\.type === 'revolve' && \(\(f as any\)\.op === 'cut' \|\| \(f as any\)\.op === 'intersect'\)/)
  assert.doesNotMatch(st, SC)
  assert.doesNotMatch(tl, /切割\(车槽\)/)
})

test('runtime: applyFeatures plate + revolve op=cut → volume decreases (車槽)', async () => {
  reset()
  assert.equal(await g().applyFeatures([PLATE], 'plate'), true, g().status)
  const v0 = await vol()
  assert.ok(near(v0, 60 * 40 * 10, 1), `plate vol ${v0}`)

  const cut = { id: 'revCut', type: 'revolve', profile: GROOVE_PROF, angle: 180, axis: 'Y', op: 'cut' }
  assert.equal(await g().applyFeatures([PLATE, cut], 'revolve cut'), true, g().status)
  assert.equal(g().features.find((f) => f.id === 'revCut')?.op, 'cut')
  const v1 = await vol()
  assert.ok(v1 < v0 - 100, `cut must remove volume: ${v1} vs plate ${v0}`)
  assert.doesNotMatch(g().status, COLLOQ)
})

test('runtime: addRevolve(..., op=cut) status Formal 切割（車槽）; volume ↓', async () => {
  reset()
  assert.equal(typeof g().addRevolve, 'function', 'addRevolve API')
  assert.equal(await g().applyFeatures([PLATE], 'plate'), true, g().status)
  const v0 = await vol()

  await g().addRevolve(GROOVE_PROF, 180, 'Y', 'cut', 0)
  assert.match(g().status, /切割（車槽）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  const rev = g().features.find((f) => f.type === 'revolve' && f.op === 'cut')
  assert.ok(rev, `expected cut revolve, feats=${g().features.map((f) => f.type + ':' + (f.op || 'new')).join(',')}`)
  assert.equal(rev.angle, 180)
  const v1 = await vol()
  assert.ok(v1 < v0 - 100, `addRevolve cut volume ${v1} < ${v0}`)
})

test('runtime: revolve cut 180° matches SO04 acceptance volume (not silent no-op)', async () => {
  // Plate ∩ revolve-profile common ≈ 8946.5 (revolve-intersect-so04 FULL_INTERSECT);
  // 180° cut already removes the full +Z wedge that intersects the plate — 360° same for this geom.
  const FULL_INTERSECT = 8946.508663785393
  reset()
  assert.equal(await g().applyFeatures([PLATE], 'plate'), true, g().status)
  const vPlate = await vol()
  assert.ok(near(vPlate, 24000, 1), `plate ${vPlate}`)

  assert.equal(
    await g().applyFeatures(
      [PLATE, { id: 'c180', type: 'revolve', profile: GROOVE_PROF, angle: 180, axis: 'Y', op: 'cut' }],
      'cut180',
    ),
    true,
    g().status,
  )
  const v180 = await vol()
  assert.ok(near(v180, 24000 - FULL_INTERSECT, 1), `180 cut vol ${v180} expected ~${24000 - FULL_INTERSECT}`)
  assert.ok(v180 < vPlate - 100, `cut must remove material ${v180} < ${vPlate}`)
})
