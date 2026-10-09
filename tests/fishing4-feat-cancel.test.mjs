// FISHING4 P2: discardFeatEdit restores pre-edit feature params (undo after editFeature).
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')
const g = () => useApp.getState()
const w = globalThis.__wheelWorker
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

test('Timeline cancel button uses mousedown preventDefault + discard waits busy', () => {
  const src = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(src, /data-testid="fe-cancel"[^>]*onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/)
  assert.match(src, /while \(wait-- > 0 && useApp\.getState\(\)\.busy\)/)
  assert.doesNotMatch(src, /取消.*确定|取消.*關閉/)
})

test('editFeature then undo-to-base restores prim C', async () => {
  useApp.setState({ ...useApp.getInitialState(), introOpen: false, appConfirm: async () => false }, true)
  await g().applyFeatures([{ id: 'p1', type: 'prim', shape: 'box', a: 40, b: 40, c: 10, op: 'new' }], 'prim')
  const feat = g().features.find((f) => f.type === 'prim')
  assert.ok(feat)
  assert.equal(feat.c, 10)
  const base = g().undoStack.length
  g().selectFeature(feat.id)
  await g().editFeature(feat.id, { c: 30 })
  assert.equal(g().features.find((f) => f.id === feat.id).c, 30)
  assert.ok(g().undoStack.length > base)
  let wait = 40
  while (wait-- > 0 && g().busy) await new Promise((r) => setTimeout(r, 10))
  let guard = 40
  while (guard-- > 0 && g().undoStack.length > base) await g().undo()
  assert.equal(g().features.find((f) => f.id === feat.id).c, 10)
})

test('edit extrude height then undo-to-base restores original volume', async () => {
  useApp.setState({
    ...useApp.getInitialState(),
    introOpen: false,
    appConfirm: async () => false,
    mode: 'sketch',
    sketchProfiles: [{ type: 'rect', a: [0, 0], b: [20, 20] }],
    sketchShape: null,
    skCons: [],
    extrudeHeight: 10,
    sketchOp: 'new',
  }, true)
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  const ext = g().features.find((f) => f.type === 'extrude')
  assert.ok(ext)
  const v0 = await vol()
  assert.ok(Math.abs(v0 - 4000) < 0.1, `expected 4000 got ${v0}`)
  const base = g().undoStack.length
  await g().editFeature(ext.id, { height: 25 })
  assert.equal(g().features.find((f) => f.id === ext.id).height, 25)
  const v1 = await vol()
  assert.ok(Math.abs(v1 - 10000) < 0.1, `expected 10000 got ${v1}`)
  let wait = 40
  while (wait-- > 0 && g().busy) await new Promise((r) => setTimeout(r, 10))
  let guard = 40
  while (guard-- > 0 && g().undoStack.length > base) await g().undo()
  assert.equal(g().features.find((f) => f.id === ext.id).height, 10)
  const v2 = await vol()
  assert.ok(Math.abs(v2 - v0) < 0.1, `restored ${v2} vs ${v0}`)
})
