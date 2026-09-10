import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const { useApp } = await import('../src/store.ts')
const initial = useApp.getInitialState()
function circle(cons = []) {
  useApp.setState({ ...initial, mode: 'sketch', sketchTool: 'select',
    sketchShape: { type: 'circle', c: [40, 40], r: 20 }, skCons: cons }, true)
}
test('quick release commits the release point, not the last preview, with one undo', async () => {
  circle()
  assert.equal(useApp.getState().skDragStart([40, 40]), true)
  const preview = useApp.getState().skDragMove([45, 45])
  await useApp.getState().skDragEnd([52, 48])
  await preview
  assert.deepEqual(useApp.getState().sketchShape.c, [52, 48])
  assert.equal(useApp.getState().sketchUndo.length, 1)
  await useApp.getState().undo()
  assert.deepEqual(useApp.getState().sketchShape.c, [40, 40])
  await useApp.getState().redo()
  assert.deepEqual(useApp.getState().sketchShape.c, [52, 48])
})
test('release without a move event still commits its position', async () => {
  circle()
  useApp.getState().skDragStart([40, 40])
  await useApp.getState().skDragEnd([47, 49])
  assert.deepEqual(useApp.getState().sketchShape.c, [47, 49])
})
test('Esc cancels an in-flight final solve and stays in the sketch', async () => {
  circle()
  useApp.getState().skDragStart([40, 40])
  const final = useApp.getState().skDragEnd([52, 48])
  assert.equal(useApp.getState().escSketch(), true)
  await final
  assert.equal(useApp.getState().mode, 'sketch')
  assert.deepEqual(useApp.getState().sketchShape.c, [40, 40])
  assert.equal(useApp.getState().sketchUndo.length, 0)
})
test('a cancelled gesture cannot overwrite the next gesture', async () => {
  circle()
  useApp.getState().skDragStart([40, 40])
  const old = useApp.getState().skDragMove([90, 90])
  useApp.getState().skDragCancel()
  useApp.getState().skDragStart([40, 40])
  await useApp.getState().skDragEnd([55, 45])
  await old
  assert.deepEqual(useApp.getState().sketchShape.c, [55, 45])
  assert.equal(useApp.getState().sketchUndo.length, 1)
})
test('diameter-constrained rim retains its dimension, gives a useful reason, and adds no no-op undo', async () => {
  const dim = { id: 'd1', kind: 'dim', type: 'dia', a: { kind: 'circle', shape: 0 }, value: 40 }
  circle([dim])
  useApp.getState().skDragStart([60, 40])
  await useApp.getState().skDragEnd([75, 40])
  assert.equal(useApp.getState().sketchShape.r, 20)
  assert.deepEqual(useApp.getState().skCons, [dim])
  assert.match(useApp.getState().status, /尺寸/)
  assert.equal(useApp.getState().sketchUndo.length, 0)
  assert.equal(useApp.getState().skDof, 2)
})
test('free rim grows and remains draggable on the next gesture', async () => {
  circle()
  useApp.getState().skDragStart([60, 40])
  await useApp.getState().skDragEnd([75, 40])
  assert.equal(useApp.getState().sketchShape.r, 35)
  assert.equal(useApp.getState().skDragStart([75, 40]), true)
  await useApp.getState().skDragEnd([80, 40])
  assert.equal(useApp.getState().sketchShape.r, 40)
})
test('finishing a sketch waits for the active gesture; a click creates no undo', async () => {
  circle()
  useApp.getState().skDragStart([40, 40])
  useApp.getState().finishSketch()
  assert.equal(useApp.getState().mode, 'sketch')
  await useApp.getState().skDragEnd([40, 40])
  assert.equal(useApp.getState().sketchUndo.length, 0)
})
test('edge drag preserves the edge vector and commits both endpoints at release', async () => {
  circle()
  useApp.setState({ sketchShape: { type: 'poly', pts: [[30, 40], [70, 40]], open: true } })
  assert.equal(useApp.getState().skDragStart([50, 40]), true)
  await useApp.getState().skDragEnd([58, 49])
  const pts=useApp.getState().sketchShape.pts
  assert.deepEqual(pts, [[38, 49], [78, 49]])
  assert.equal(useApp.getState().sketchUndo.length, 1)
})
test('switching tools cancels a pending solve without replacing the new tool', async () => {
  circle()
  useApp.getState().skDragStart([40, 40])
  const pending=useApp.getState().skDragEnd([55, 45])
  useApp.getState().setSketchTool('dimension')
  await pending
  assert.equal(useApp.getState().sketchTool, 'dimension')
  assert.equal(useApp.getState().skDrag, null)
  assert.deepEqual(useApp.getState().sketchShape.c, [40, 40])
})

test('partial mobility probes do not lock an unprobed free shape', async () => {
  circle()
  useApp.setState({sketchProfiles:[{type:'circle',c:[0,0],r:5}],skDof:6,skFreeShapes:new Set([0])})
  assert.equal(useApp.getState().skDragStart([40,40]),true)
  await useApp.getState().skDragEnd([52,48])
  assert.deepEqual(useApp.getState().sketchShape.c,[52,48])
  assert.deepEqual(useApp.getState().sketchProfiles[0].c,[0,0])
  await useApp.getState().undo()
  assert.deepEqual(useApp.getState().sketchShape.c,[40,40])
})
