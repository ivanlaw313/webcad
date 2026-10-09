// UX2 #4：畫緊折線 Ctrl+Z 只撤最後一段（Fusion），唔係成條冇晒。UX2 #5：Delete 只刪揀中嗰段（折線帶 verts+全 0 bulges 都拆得）。
import test from 'node:test'; import assert from 'node:assert/strict'; import { register, createRequire } from 'node:module'; import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts'); const g = () => useApp.getState()
const { removeContourEdges } = await import('../src/sketch/deleteSketchEdges.ts')
const shapes = () => [...g().sketchProfiles, ...(g().sketchShape ? [g().sketchShape] : [])]
const P = [[0, 0], [30, 0], [30, 20], [10, 20], [10, 40]]

test('Ctrl+Z while drawing a polyline removes only the last segment, then the start point', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY'); g().setSketchTool('polyline')
  for (const p of P) g().onSketchClick(p)
  assert.equal(g().polyPts.length, 5)
  const L = g().sketchUndo.length
  await g().undo()
  assert.equal(g().polyPts.length, 4, 'one segment undone')
  assert.ok(g().sketchUndo.length <= L, 'no snapshot left that would resurrect the undone point')
  if (L) assert.ok(!g().sketchUndo.some((u) => u.polyPts?.length === 5 || (u.polyPts?.length === 4 && g().sketchUndo.indexOf(u) === g().sketchUndo.length - 1)))
  assert.equal(g().mode, 'sketch'); assert.equal(g().sketchTool, 'polyline')
  await g().undo(); await g().undo(); await g().undo()
  assert.equal(g().polyPts.length, 1)
  await g().undo()
  assert.equal(g().polyPts.length, 0)
  assert.equal(g().polyBulges.length, 0)
})

test('Delete on one segment of a drawn polyline keeps the other segments', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY'); g().setSketchTool('polyline')
  for (const p of P) g().onSketchClick(p)
  await g().finishOpenPolyline()
  assert.equal(shapes().length, 1)
  g().setSketchTool('select')
  useApp.setState({ skSel: [{ kind: 'edge', shape: 0, idx: 1 }] })
  await g().skDeleteSel()
  const segs = shapes().reduce((n, s) => n + s.pts.length - 1, 0)
  assert.equal(segs, 3, JSON.stringify(shapes()))
})

test('pure: zero-bulge verts polyline splits; UX4 #9: a path with an arc segment splits too and the arc keeps its bulge', () => {
  const z = removeContourEdges({ type: 'poly', pts: P, verts: P, bulges: [0, 0, 0, 0], open: true }, [2])
  assert.equal(z.shapes.length, 2)
  const a = removeContourEdges({ type: 'poly', pts: P, verts: P, bulges: [0, 0.4, 0, 0], open: true }, [2])
  assert.equal(a.shapes.length, 2)
  assert.ok(a.shapes.some((sh) => (sh.bulges ?? []).includes(0.4)), 'arc segment survives with its bulge')
})
test('done', () => setTimeout(() => process.exit(process.exitCode || 0), 50))
