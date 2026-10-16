/**
 * CORE16 residual more19: Timeline Ctrl+Z two consecutive steps restore volume stepwise.
 * box → fillet → cut-hole; undo → fillet vol; undo → box vol.
 * Complements core16-undo-delete-restore-volume (single undo after delete) with
 * two stacked applyFeatures undos. No product fix.
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

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const FILLET = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }
/** Through-hole cut — safe after fillet (chamfer-on-filleted edges often fails). */
const HOLE = {
  id: 'H',
  type: 'extrude',
  profile: { kind: 'circle', c: [20, 15], r: 4 },
  height: 20,
  operation: 'cut',
}

test('source: undo pushes history; Ctrl+Z path enqueueHistoryTransition', () => {
  const st = rd('src/store.ts')
  assert.match(st, /undo:\s*\(\)\s*=>\s*enqueueHistoryTransition/)
  assert.match(st, /undoStack/)
  assert.match(st, /applyFeatures/)
})

test('runtime: two consecutive Ctrl+Z restore volume stepwise (box→fillet→cut)', async () => {
  reset()
  assert.equal(typeof g().undo, 'function', 'undo API')

  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const vBox = await vol()
  assert.ok(near(vBox, 40 * 30 * 20, 1), `box ${vBox}`)
  const u0 = g().undoStack.length

  assert.equal(await g().applyFeatures([BOX, FILLET], 'box+fillet'), true, g().status)
  const vFillet = await vol()
  assert.ok(vFillet < vBox - 1, `fillet cuts vol ${vFillet} < ${vBox}`)
  assert.ok(g().undoStack.length > u0, 'fillet push undo')

  assert.equal(await g().applyFeatures([BOX, FILLET, HOLE], 'box+fillet+hole'), true, g().status)
  const vHole = await vol()
  assert.ok(vHole < vFillet - 10, `hole cuts further ${vHole} < ${vFillet}`)
  assert.equal(g().features.map((f) => f.id).join(','), 'B,F,H')

  // Ctrl+Z #1 → back to fillet volume
  await g().undo()
  assert.doesNotMatch(g().status, /撤銷失敗/)
  assert.equal(g().features.some((f) => f.id === 'H'), false, `after undo1 feats=${g().features.map((f) => f.id)}`)
  assert.equal(g().features.find((f) => f.id === 'F')?.type, 'fillet', g().status)
  const vUndo1 = await vol()
  assert.ok(near(vUndo1, vFillet, 1), `1st Ctrl+Z → fillet vol: ${vUndo1} vs ${vFillet}`)

  // Ctrl+Z #2 → back to box volume
  await g().undo()
  assert.doesNotMatch(g().status, /撤銷失敗/)
  assert.equal(g().features.some((f) => f.type === 'fillet'), false, g().status)
  assert.equal(g().features.find((f) => f.id === 'B')?.type, 'prim', g().status)
  const vUndo2 = await vol()
  assert.ok(near(vUndo2, vBox, 1), `2nd Ctrl+Z → box vol: ${vUndo2} vs ${vBox}`)
})

test('runtime: two consecutive undos after extrude then cut restore volumes stepwise', async () => {
  reset()
  const base = {
    id: 'E0',
    type: 'extrude',
    profile: { kind: 'rect', a: [-20, -15], b: [20, 15] },
    height: 20,
    operation: 'new',
  }
  const cut = {
    id: 'E1',
    type: 'extrude',
    profile: { kind: 'circle', c: [0, 0], r: 5 },
    height: 20,
    operation: 'cut',
  }

  assert.equal(await g().applyFeatures([base], 'extrude'), true, g().status)
  const v0 = await vol()
  assert.ok(near(v0, 40 * 30 * 20, 1), `base ${v0}`)

  assert.equal(await g().applyFeatures([base, cut], 'cut hole'), true, g().status)
  const v1 = await vol()
  assert.ok(v1 < v0 - 10, `cut ${v1} < ${v0}`)

  // Second additive step on top of cut body
  const boss = {
    id: 'E2',
    type: 'extrude',
    profile: { kind: 'circle', c: [10, 0], r: 3 },
    height: 8,
    operation: 'new',
    baseZ: 20,
  }
  assert.equal(await g().applyFeatures([base, cut, boss], 'boss'), true, g().status)
  const v2 = await vol()
  assert.ok(v2 > v1 + 1, `boss adds vol ${v2} > ${v1}`)

  await g().undo()
  const u1 = await vol()
  assert.ok(near(u1, v1, 1), `undo boss → cut vol ${u1} vs ${v1}`)
  assert.equal(g().features.some((f) => f.id === 'E2'), false)

  await g().undo()
  const u2 = await vol()
  assert.ok(near(u2, v0, 1), `undo cut → base vol ${u2} vs ${v0}`)
  assert.equal(g().features.some((f) => f.id === 'E1'), false)
})
