import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { commandDisabledReason, activeModelCommand } from '../src/cad/commandAvailability.ts'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const initial = useApp.getInitialState()

for (const state of [
  { featDlg: { kind: 'revolve', params: { angle: 125 } } },
  { extrudeDlgOpen: true, extrudeHeight: 17 }, { sweepDlgOpen: true }, { loftDlgOpen: true },
  { holeMode: true }, { shellMode: true }, { pushPullMode: true },
  { edgeRoundPick: 'fillet' }, { faceFilletMode: true }, { draftPickMode: 1 },
  { moveFaceMode: true }, { rotateFaceMode: true },
]) {
  test(`an active ${activeModelCommand(state)} preserves its draft against another command`, async () => {
    useApp.setState({ ...initial, ...state }, true)
    const before = useApp.getState()
    assert.ok(commandDisabledReason(before, 'box'))
    await before.runCommand('box', 'Box')
    for (const [key, value] of Object.entries(state)) assert.deepEqual(useApp.getState()[key], value)
    assert.deepEqual(useApp.getState().features, before.features)
    assert.deepEqual(useApp.getState().lastCommand, before.lastCommand)
  })
}

test('context policy distinguishes plane picking, sketch tools and model commands', () => {
  assert.ok(commandDisabledReason({ mode: 'pickplane' }, 'sk_circle'))
  assert.ok(commandDisabledReason({ mode: 'model' }, 'sk_circle'))
  assert.equal(commandDisabledReason({ mode: 'sketch' }, 'sk_circle'), null)
  assert.ok(commandDisabledReason({ mode: 'sketch' }, 'fillet'))
  assert.equal(commandDisabledReason({ mode: 'sketch' }, 'extrude'), null)
  assert.equal(commandDisabledReason({ mode: 'sketch' }, 'params'), null)
  assert.ok(commandDisabledReason({ featDlg: { kind: 'box' } }, 'sample:car'))
  assert.equal(commandDisabledReason({ featDlg: { kind: 'box' } }, 'act:fit'), null)
})

for (const command of ['trim', 'extend', 'break']) {
  test(`switching to ${command} clears incomplete drawing and dimension picks, keeping committed geometry`, async () => {
    const shape = { type: 'circle', cx: 0, cy: 0, r: 10 }
    useApp.setState({ ...initial, mode: 'sketch', sketchShape: shape, sketchTool: 'dimension',
      polyPts: [[0,0],[5,0]], skPendingPt: {shape:0, kind:'point',idx:0},
      skPendingPair: { a: {shape:0,kind:'point',idx:0}, b: {shape:0,kind:'point',idx:1} },
      skArmedCon: 'tangent' }, true)
    await useApp.getState().runCommand('sk_'+command, command)
    const s = useApp.getState()
    assert.equal(s.sketchTool, command)
    assert.deepEqual(s.polyPts, [])
    assert.equal(s.skPendingPt, null)
    assert.equal(s.skPendingPair, null)
    assert.equal(s.skArmedCon, null)
    assert.deepEqual(s.sketchShape, shape)
  })
}

test('choosing Select exits constraint application; cancelling a model command unlocks the next', async () => {
  useApp.setState({ ...initial, mode: 'sketch', skArmedCon: 'coincident' }, true)
  await useApp.getState().runCommand('sk_select', 'Select')
  assert.equal(useApp.getState().skArmedCon, null)
  useApp.setState({ ...initial, extrudeDlgOpen: true, extrudeHeight: 17 }, true)
  useApp.getState().cancelExtrudeDlg()
  await useApp.getState().runCommand('box', 'Box')
  assert.equal(useApp.getState().featDlg?.kind, 'box')
})
