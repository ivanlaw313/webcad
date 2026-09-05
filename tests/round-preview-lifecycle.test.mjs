import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

// Execute the actual store actions with a deferred kernel, without WebGL or a
// browser. This makes the response ordering deterministic, including the gap
// before the debounce timer fires.
function harness() {
  const source = readFileSync(process.env.WEBCAD_STORE_SOURCE || new URL('../src/store.ts', import.meta.url), 'utf8')
  const actions = source.slice(source.lastIndexOf('  cancelEdgeRound: () =>'), source.indexOf('  // Fusion-style shell command:'))
  let state = {
    edgeRoundPick: 'fillet', edgeRoundPicks: [[0, 0, 0]], edgeRoundRadii: [2],
    filletType: 'fillet', filletMode: 'radius', edgeRoundSize: 2,
    features: [{ id: 'body', type: 'prim' }], params: [], paramBindings: [], suppressedIds: [],
    bodyMesh: { triangles: [0, 1, 2], tag: 'committed' },
  }
  const pending = [], timers = new Map()
  let timerId = 0
  const context = vm.createContext({
    get: () => state,
    set: patch => { state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) } },
    cad: { previewRound: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
    hasSolid: () => true,
    buildRoundFeature: () => ({ id: '~pv-round', type: 'fillet' }),
    applyParamBindings: f => f, expandFeats: f => f,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId },
    clearTimeout: id => timers.delete(id),
  })
  const api = vm.runInContext(stripTypeScriptTypes(`let _roundPvSeq = 0; let _roundPvTimer = null; ({${actions}})`), context)
  state = { ...state, ...api }
  return { api, pending, timers, state: () => state, update: patch => { state = { ...state, ...patch } } }
}
const mesh = tag => ({ triangles: [0, 1, 2], tag })

test('changing parameters invalidates an in-flight preview before the debounce fires', async () => {
  const h = harness(), first = h.api.runRoundPreview()
  h.api.scheduleRoundPreview()
  h.pending[0].resolve(mesh('obsolete'))
  await first
  assert.equal(h.state().roundPreviewMesh, null)
  assert.equal(h.state().bodyMesh.tag, 'committed')
})

test('cancel then reopen cannot receive the previous command preview', async () => {
  const h = harness(), first = h.api.runRoundPreview()
  h.api.cancelEdgeRound()
  h.update({ edgeRoundPick: 'fillet', edgeRoundPicks: [[1, 0, 0]], edgeRoundRadii: [1] })
  h.pending[0].resolve(mesh('cancelled'))
  await first
  assert.equal(h.state().roundPreviewMesh, null)
  assert.equal(h.state().roundPreviewBusy, false)
})

test('clearing selection cancels pending work and ignores an old response', async () => {
  const h = harness(), first = h.api.runRoundPreview()
  h.api.scheduleRoundPreview()
  h.api.clearEdgeRoundPicks()
  h.pending[0].resolve(mesh('deselected'))
  await first
  assert.equal(h.state().roundPreviewMesh, null)
  assert.equal(h.state().roundPreviewBusy, false)
  assert.equal(h.timers.size, 0)
})

test('kernel rejection clears busy, preserves the model, and allows a new preview', async () => {
  const h = harness(), first = h.api.runRoundPreview()
  h.pending[0].reject(new Error('kernel unavailable'))
  await assert.doesNotReject(first)
  assert.equal(h.state().roundPreviewBusy, false)
  assert.equal(h.state().roundPreviewFail, true)
  assert.equal(h.state().bodyMesh.tag, 'committed')
  const retry = h.api.runRoundPreview()
  h.pending[1].resolve(mesh('recovered'))
  await retry
  assert.equal(h.state().roundPreviewMesh.tag, 'recovered')
  assert.equal(h.state().roundPreviewFail, false)
})

test('older rejection cannot erase the newest successful preview', async () => {
  const h = harness(), first = h.api.runRoundPreview(), latest = h.api.runRoundPreview()
  h.pending[1].resolve(mesh('latest'))
  await latest
  h.pending[0].reject(new Error('old failure'))
  await assert.doesNotReject(first)
  assert.equal(h.state().roundPreviewMesh.tag, 'latest')
  assert.equal(h.state().roundPreviewFail, false)
})
