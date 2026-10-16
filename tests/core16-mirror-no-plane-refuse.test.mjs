/**
 * CORE16 residual more11: Mirror without plane → Formal refuse (Formal TC).
 * plane=PICK without pickO/pickN refuses; legal XY/YZ plane applies (ΔV).
 * Complements core16-mirror-gate (no-selection / no-solid) + b3 #4 without re-testing those.
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

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /请点选一个平面|镜像：请|已镜像（跨/
const NO_PLANE = /^鏡像：請點選一個平面作為鏡像面/

test('source: mirror-without-plane refuse is Formal 繁中 (no SC / colloquial)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /鏡像：請點選一個平面作為鏡像面（或改選 XY／XZ／YZ）/)
  assert.match(st, /if \(String\(p\.plane\) === 'PICK' && \(typeof p\.pickO !== 'string' \|\| typeof p\.pickN !== 'string'\)\)/)
  assert.doesNotMatch(st, /请点选一个平面作为镜像面/)
  assert.doesNotMatch(st, /镜像：请点选/)
})

test('runtime: plane=PICK with no face pick → Formal refuse; tree/volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  g().openFeatDlg('mirror')
  g().setFeatParam('target', 'body')
  g().setFeatParam('plane', 'PICK')
  // Explicitly clear any stale pick payload
  useApp.setState((s) => {
    if (!s.featDlg || s.featDlg.kind !== 'mirror') return {}
    const { pickO: _o, pickN: _n, ...rest } = s.featDlg.params
    return { featDlg: { ...s.featDlg, params: { ...rest, plane: 'PICK' } } }
  })
  assert.equal(g().featDlg?.params?.pickO, undefined)
  assert.equal(g().featDlg?.params?.pickN, undefined)
  await g().commitFeatDlg()
  assert.match(g().status, NO_PLANE)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.ok(g().featDlg, 'dialog stays open on refuse')
  assert.deepEqual(g().features, before)
  assert.equal(g().features.filter((f) => f.type === 'mirror').length, 0)
  assert.ok(Math.abs((await vol()) - v0) < 1e-3)
})

test('runtime: plane=PICK then clear pick mid-dialog still refuses', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('mirror')
  g().setFeatParam('target', 'body')
  g().setFeatParam('plane', 'PICK')
  // Simulate a pick then user clears / switches without valid data
  g().setFeatParam('pickO', '10,5,0')
  g().setFeatParam('pickN', '1,0,0')
  // Wipe pick coords (plane stays PICK) — commit must refuse
  useApp.setState((s) => {
    if (!s.featDlg) return {}
    const params = { ...s.featDlg.params }
    delete params.pickO
    delete params.pickN
    return { featDlg: { ...s.featDlg, params } }
  })
  await g().commitFeatDlg()
  assert.match(g().status, NO_PLANE)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before)
})

test('runtime: after refuse, legal YZ plane commits (~2× volume)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  g().openFeatDlg('mirror')
  g().setFeatParam('target', 'body')
  g().setFeatParam('plane', 'PICK')
  await g().commitFeatDlg()
  assert.match(g().status, NO_PLANE)
  assert.ok(g().featDlg)

  // Recover: choose cardinal plane
  g().setFeatParam('plane', 'YZ')
  g().setFeatParam('offset', 0)
  g().setFeatParam('mirrorOp', 0) // join
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.ok(g().features.some((f) => f.type === 'mirror'), g().status)
  const v1 = await vol()
  assert.ok(Math.abs(v1 - 2 * v0) / (2 * v0) < 0.02, `legal mirror symmetry ${v0} → ${v1}`)
  assert.doesNotMatch(g().status, COLLOQ)
})

test('runtime: applyMirrorFacePick then commit succeeds (PICK path happy)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  g().openFeatDlg('mirror')
  g().setFeatParam('target', 'body')
  g().setFeatParam('plane', 'PICK')
  g().applyMirrorFacePick([0, 15, 10], [1, 0, 0]) // YZ-like face at x=0
  assert.equal(typeof g().featDlg.params.pickO, 'string')
  assert.equal(typeof g().featDlg.params.pickN, 'string')
  g().setFeatParam('mirrorOp', 0)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  const mir = g().features.find((f) => f.type === 'mirror')
  assert.ok(mir, g().status)
  assert.ok(mir.planeN, 'picked plane stores planeN')
  const v1 = await vol()
  assert.ok(v1 > v0 + 100, `picked-plane mirror grows body ${v0} → ${v1}`)
})
