/**
 * CORE16 residual more13: Shell (抽殼) with no face/body selection → Formal refuse.
 * Complements core16-shell-thickness-fillet (thickness 0 / fillet) without re-testing those.
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
const SC = /请先选择要移除的面|请先选择要抽壳的实体|抽壳：/
const OPEN_REFUSE = /^請先選擇要移除的面$/
const CLOSED_REFUSE = /^請先選擇要抽殼的實體$/

test('source: commitShell empty-selection refuse is Formal 繁中 (open + closed)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /if \(!pts\.length\) \{ set\(\{ status: shellType === 'closed' \? '請先選擇要抽殼的實體' : '請先選擇要移除的面' \}\); return \}/)
  assert.doesNotMatch(st, /请先选择要移除的面/)
  assert.doesNotMatch(st, /请先选择要抽壳的实体/)
  assert.match(st, /buildShellFeature[\s\S]*?if \(!s\.shellPicks\.length/)
})

test('runtime: open shell, no face pick → Formal refuse; tree/volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  g().toggleShell()
  assert.equal(g().shellMode, true)
  assert.equal(g().shellType, 'open')
  assert.deepEqual(g().shellPicks, [])
  g().setShellThickness(2)
  await g().commitShell()
  assert.match(g().status, OPEN_REFUSE)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().shellMode, true, 'mode stays open so user can pick')
  assert.deepEqual(g().features, before)
  assert.equal(g().features.filter((f) => f.type === 'shell').length, 0)
  assert.ok(Math.abs((await vol()) - v0) < 1e-3)
})

test('runtime: closed shell, no body pick → Formal refuse', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().toggleShell()
  g().setShellType('closed')
  assert.equal(g().shellType, 'closed')
  assert.deepEqual(g().shellPicks, [])
  g().setShellThickness(2)
  await g().commitShell()
  assert.match(g().status, CLOSED_REFUSE)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().shellMode, true)
  assert.deepEqual(g().features, before)
})

test('runtime: after refuse, single face pick + legal thickness commits (ΔV)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  g().toggleShell()
  await g().commitShell()
  assert.match(g().status, OPEN_REFUSE)

  // Recover: pick CAD top face center via three-world coords (20,15,20) → [20, 20, -15]
  g().shellPickAt([20, 20, -15])
  assert.equal(g().shellPicks.length, 1)
  g().setShellThickness(2)
  await g().commitShell()
  assert.equal(g().shellMode, false, g().status)
  assert.ok(g().features.some((f) => f.type === 'shell'), g().status)
  const v1 = await vol()
  assert.ok(v1 < v0 - 50, `legal shell must hollow: ${v0} → ${v1}`)
  assert.match(g().status, /已抽殼|Shelled|抽殼完成/)
  assert.doesNotMatch(g().status, COLLOQ)
})

test('runtime: clearShellPicks then commit still Formal refuses', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().toggleShell()
  g().shellPickAt([20, 20, -15])
  assert.ok(g().shellPicks.length >= 1)
  g().clearShellPicks()
  assert.deepEqual(g().shellPicks, [])
  g().setShellThickness(2)
  await g().commitShell()
  assert.match(g().status, OPEN_REFUSE)
  assert.deepEqual(g().features, before)
})
