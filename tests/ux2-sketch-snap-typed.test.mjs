// UX2 #6：滑鼠落點後清走打咗一半嘅長度/角度緩衝（Tab 揀咗嘅第 2 格），下一段打數唔會入錯「角度 d2」。
// UX2 #7：吸附／閉合／去重容差跟屏幕 px — 放大時唔再一點就吸去 1.2 mm／4 mm 外嘅點（斜線、碎線、自動閉合）。
import test from 'node:test'; import assert from 'node:assert/strict'; import { register, createRequire } from 'node:module'; import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp, setSnapScale, sketchDupTol, sketchCloseTol } = await import('../src/store.ts'); const g = () => useApp.getState()
const fresh = () => { useApp.setState(useApp.getInitialState(), true); g().startSketch(); g().chooseSketchPlane('XY'); g().setSketchTool('polyline') }

test('#6 a click clears the half-typed length/angle buffer and the Tab-selected field', async () => {
  setSnapScale(0.7); fresh()
  await g().onSketchClick([0, 0]); await g().onSketchClick([20, 0])
  g().sketchTypeKey('5'); g().sketchTypeKey('Tab')
  assert.equal(g().dimField, 1)
  await g().onSketchClick([20, 20])
  assert.deepEqual(g().dimBuf, ['', '']); assert.equal(g().dimField, 0)
  g().sketchTypeKey('3'); g().sketchTypeKey('0')
  assert.deepEqual(g().dimBuf, ['30', ''], 'typed digits go to the LENGTH field of the new segment')
})

test('#7 zoomed in: snap radius is screen-px (no 1.2 mm floor), close/dup tolerances shrink too', async () => {
  setSnapScale(0.05)   // 放大：0.05 mm/px
  assert.ok(sketchCloseTol() <= 0.5 + 1e-9 && sketchDupTol() <= 0.15 + 1e-9)
  fresh()
  await g().onSketchClick([0, 0]); await g().onSketchClick([10, 0])
  await g().onSketchClick([10.6, 0.5])           // 0.78 mm from (10,0) = 16 px — must NOT snap back onto it
  const p = g().polyPts.at(-1)
  assert.ok(Math.hypot(p[0] - 10, p[1]) > 0.5, JSON.stringify(g().polyPts))
  await g().onSketchClick([2, 2.5])              // 3.2 mm from the start = 64 px — must not auto-close
  assert.equal(g().polyPts.length, 4, g().status)
  setSnapScale(0.7)
  assert.ok(sketchCloseTol() > 3 && sketchDupTol() > 1, 'normal zoom keeps comfortable tolerances')
})
test('done', () => setTimeout(() => process.exit(process.exitCode || 0), 50))
