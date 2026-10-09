// UX2 #3：旋轉失敗要講真原因（繁體）— 唔好淨係「重建失敗」。
import test from 'node:test'; import assert from 'node:assert/strict'; import { register, createRequire } from 'node:module'; import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { diagnoseRevolve, revolveFailStatus } = await import('../src/cad/revolveDiagnose.ts')
const g = () => useApp.getState()
const src = { plane: 'XY', baseZ: 0 }
const Y = [0, 1, 0]

test('pure diagnosis: crossing axis, on-axis, tiny segment, self-intersection', () => {
  assert.match(diagnoseRevolve({ profile: { kind: 'poly', pts: [[-10, 0], [10, 0], [10, 20], [-10, 20]] }, source: src, axisDir: Y }).join(), /跨過了旋轉軸/)
  assert.match(diagnoseRevolve({ profile: { kind: 'poly', pts: [[0, 0], [0, 10], [0, 20]] }, source: src, axisDir: Y }).join(), /貼住旋轉軸/)
  assert.match(diagnoseRevolve({ profile: { kind: 'poly', pts: [[5, 0], [15, 0], [15, 0.01], [15, 20], [5, 20]] }, source: src, axisDir: Y }).join(), /碎線/)
  assert.match(diagnoseRevolve({ profile: { kind: 'poly', pts: [[5, 0], [15, 20], [15, 0], [5, 20]] }, source: src, axisDir: Y }).join(), /自己交叉/)
  assert.deepEqual(diagnoseRevolve({ profile: { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }, source: src, axisDir: Y }), [])
})
test('pure diagnosis: sketch-level open half-section / multiple profiles / stray lines', () => {
  const main = { type: 'poly', open: true, pts: [[0, 0], [10, 0], [10, 20], [3, 20]] }
  const c = diagnoseRevolve({ profile: { kind: 'poly', pts: main.pts.map(([s, t]) => [s, -t]) }, mainShape: main, shapes: [{ type: 'circle', c: [50, 50], r: 3 }, { type: 'poly', open: true, pts: [[60, 0], [70, 5]] }, main], source: src, axisDir: Y }).join('|')
  assert.match(c, /未閉合/); assert.match(c, /2 個輪廓/); assert.match(c, /1 條沒有接駁的散線/)
  assert.match(revolveFailStatus([]), /^⚠ 旋轉失敗/)
})
test('store: a failing revolve tells the cause instead of a bare 「重建失敗」', async () => {
  await g().applyFeatures([], 'x')
  await g().addRevolve({ kind: 'poly', pts: [[0, 0], [0, 10], [0, 20]] }, 360, 'Y', 'new', 0, { shapes: [{ type: 'poly', pts: [[0, 0], [0, -10], [0, -20]] }], cons: [], plane: 'XY', baseZ: 0 })
  assert.ok(!g().features.some((f) => f.type === 'revolve'), 'nothing committed')
  assert.match(g().status, /旋轉失敗：.*貼住旋轉軸/, g().status)
})
test('done', () => setTimeout(() => process.exit(process.exitCode || 0), 50))
