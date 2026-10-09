// perf (v2.20): 「完成草圖」after projecting top-face edges froze/crashed a tester tab.
// Guard the store/kernel side against runaway allocation, notification storms and slow steps.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready().catch(() => {})   // font fetch may fail under node; geometry kernel is ready
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
let sets = 0
useApp.subscribe(() => { sets++ })
const STEP_BUDGET_MS = 5000   // live symptom was a freeze; normal is <0.3 s even on a loaded box
async function step(label, fn) {
  const s0 = sets, t0 = performance.now()
  await fn()
  const ms = performance.now() - t0
  assert.ok(ms < STEP_BUDGET_MS, `${label} took ${ms.toFixed(0)} ms`)
  assert.ok(sets - s0 <= 20, `${label} fired ${sets - s0} store notifications`)
  return ms
}

for (const base of [{ type: 'rect', a: [-25, -20], b: [25, 20] }, { type: 'circle', c: [0, 0], r: 20 }]) {
  test(`finish sketch after projecting top-face edges (${base.type}) stays bounded`, async () => {
    useApp.setState(useApp.getInitialState(), true)
    g().startSketch(); g().chooseSketchPlane('XY')
    useApp.setState({ sketchShape: base, sketchProfiles: [], skCons: [], extrudeHeight: 10, sketchOp: 'new' })
    await g().extrudeSketch()
    assert.equal(g().mode, 'model', g().status)
    const tris = g().bodyMesh.triangles.length / 3
    await step('sketch on face', () => g().startSketchOnFace([5, 10, 0], [0, 0, 1]))
    const segs = g().skRefGeo?.segs?.length ?? 0
    assert.ok(segs > 0 && segs <= 3 * tris, `refGeo segs ${segs} vs ${tris} tris`)
    await step('project', () => g().projectRefToSketch())
    const pts = [...g().sketchProfiles, g().sketchShape].filter(Boolean).reduce((n, s) => n + (s.pts?.length ?? 0), 0)
    assert.ok(pts > 0 && pts <= segs, `projected ${pts} points from ${segs} segments`)
    const heap0 = process.memoryUsage().heapUsed
    await step('finish', () => g().commitStandaloneSketch())
    assert.equal(g().mode, 'model', g().status)
    const sk = g().features.find((f) => f.type === 'sketch')
    assert.ok(sk, g().status)
    for (let i = 0; i < 5; i++) {
      await step('edit', () => g().editSketchOf(sk.id))
      assert.equal(g().mode, 'sketch', g().status)
      await step('finish edit', () => g().applySketchEdit(g().skEditTarget))
      assert.equal(g().mode, 'model', g().status)
      await step('undo', () => g().undo())
      await step('redo', () => g().redo())
    }
    // Projected curves must not multiply across reopen/finish cycles.
    const src = g().sketchSources[sk.sketchId]
    assert.equal(src.shapes.length, 1)
    assert.ok(src.shapes[0].pts.length <= segs)
    assert.ok(g().undoStack.length <= 60)
    const grow = (process.memoryUsage().heapUsed - heap0) / 1e6
    assert.ok(grow < 150, `heap grew ${grow.toFixed(1)} MB over 5 edit/finish/undo/redo cycles`)
  })
}
