/**
 * CORE16 residual more9: Ctrl+Z / feature delete restores volume.
 * Uses store requestRemoveFeature + undo (APIs exist). Complements
 * undo-delete-restores-model (shared-sketch / shell STEP equality) with
 * numeric volume restore after fillet/chamfer delete — CORE16 solid path.
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
const FILLET_R2 = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }
const CHAMFER_D2 = { id: 'C', type: 'chamfer', distance: 2, edges: 'all', cmode: 'equal' }
const near = (a, b, t = 1e-2) => Math.abs(a - b) < t

test('source: requestRemoveFeature + undo push pre-delete snapshot (Ctrl+Z path)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /requestRemoveFeature:\s*async\s*\(id\)\s*=>/)
  assert.match(st, /removeFeature:\s*async\s*\(id\)\s*=>/)
  assert.match(st, /undo:\s*\(\)\s*=>\s*enqueueHistoryTransition/)
  // T1: exact pre-delete snapshot for undo
  assert.match(st, /exact pre-delete snapshot|const before = docSnap\(get\(\)\)/)
  assert.match(st, /applyFeatures\(features, '已刪除特徵並重建'/)
})

test('runtime: delete fillet → volume rises to box; Ctrl+Z restores fillet volume', async () => {
  reset()
  assert.equal(typeof g().requestRemoveFeature, 'function', 'requestRemoveFeature API')
  assert.equal(typeof g().undo, 'function', 'undo API')
  assert.equal(await g().applyFeatures([BOX], 'box only'), true, g().status)
  const vBox = await vol()
  assert.ok(near(vBox, 40 * 30 * 20, 1), `box vol ${vBox}`)

  assert.equal(await g().applyFeatures([BOX, FILLET_R2], 'box+fillet'), true, g().status)
  const vFillet = await vol()
  assert.ok(vFillet < vBox - 1, `fillet cuts volume ${vFillet} < ${vBox}`)

  await g().requestRemoveFeature('F')
  assert.equal(g().features.some((f) => f.id === 'F'), false, g().status)
  assert.doesNotMatch(g().status, /撤銷失敗/)
  const vDel = await vol()
  assert.ok(near(vDel, vBox, 1), `delete fillet → box volume: ${vDel} vs ${vBox}`)

  await g().undo()
  assert.doesNotMatch(g().status, /撤銷失敗/)
  assert.equal(g().features.find((f) => f.id === 'F')?.type, 'fillet', g().status)
  assert.equal(g().features.find((f) => f.id === 'F')?.radius, 2)
  const vUndo = await vol()
  assert.ok(near(vUndo, vFillet, 1), `Ctrl+Z restores fillet volume: ${vUndo} vs ${vFillet}`)
})

test('runtime: delete chamfer → Ctrl+Z restores chamfer volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX, CHAMFER_D2], 'box+chamfer'), true, g().status)
  const vCh = await vol()
  assert.ok(vCh < 40 * 30 * 20 - 1, `chamfer vol ${vCh}`)

  await g().requestRemoveFeature('C')
  assert.equal(g().features.some((f) => f.id === 'C'), false, g().status)
  const vDel = await vol()
  assert.ok(near(vDel, 40 * 30 * 20, 1), `after delete ${vDel}`)

  await g().undo()
  assert.doesNotMatch(g().status, /撤銷失敗/)
  assert.equal(g().features.find((f) => f.id === 'C')?.distance, 2, g().status)
  const vUndo = await vol()
  assert.ok(near(vUndo, vCh, 1), `Ctrl+Z restores chamfer volume: ${vUndo} vs ${vCh}`)
})

test('runtime: undo of applyFeatures fillet step also restores pre-fillet volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const vBox = await vol()
  assert.equal(await g().applyFeatures([BOX, FILLET_R2], 'add fillet'), true, g().status)
  const vFillet = await vol()
  assert.ok(vFillet < vBox - 1)

  await g().undo()
  assert.doesNotMatch(g().status, /撤銷失敗/)
  assert.equal(g().features.some((f) => f.type === 'fillet'), false, g().status)
  const vUndo = await vol()
  assert.ok(near(vUndo, vBox, 1), `undo applyFeatures restores box: ${vUndo} vs ${vBox}`)
})
