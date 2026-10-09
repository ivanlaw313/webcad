// UX2 #1：flange 杯（旋轉半截面 → 抽殼 2）喺法蘭外頂棱 R40 撳一下 → 應揀中 R40，唔係內圈 R38（舊 5 點取樣最近棱誤判）；
// 1 mm 倒角預覽＋提交成功；失敗原因文字分辨「棱搵唔返／棱本身倒唔到／數值太大」。
import test from 'node:test'; import assert from 'node:assert/strict'; import { register, createRequire } from 'node:module'; import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); const w = globalThis.__wheelWorker; await w.ready()
const { useApp, roundFailText } = await import('../src/store.ts')
const g = () => useApp.getState()
const prof = { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }
const CUP = [{ id: 'r', type: 'revolve', profile: prof, angle: 360, axis: 'Y', op: 'new' }, { id: 's', type: 'shell', thickness: 2, nears: [[10, 40, 0]], tangentChain: false, direction: 'inside' }]
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

test('edgePolylineAt near the flange outer top rim resolves the R40 circle, not the R38 inner ring', async () => {
  await w.rebuild(CUP)
  for (const a of [Math.PI / 3, 2.2, 4.0]) {
    const p = [39.7 * Math.cos(a), 40, -39.7 * Math.sin(a)]
    const ln = (await w.edgePolylineAt(p))?.pts
    assert.ok(ln && ln.length > 4, 'edge found')
    for (const q of ln) { assert.ok(Math.abs(Math.hypot(q[0], q[2]) - 40) < 0.05, `r=${Math.hypot(q[0], q[2])}`); assert.ok(Math.abs(q[1] - 40) < 0.05) }
  }
})

test('a click right on the revolve seam never resolves the seam line (seam can never be chamfered)', async () => {
  await w.rebuild(CUP)
  const ln = (await w.edgePolylineAt([40, 37.5, 0]))?.pts
  assert.ok(ln && ln.length > 4)
  const spanXZ = Math.max(...ln.map((q) => Math.hypot(q[0] - ln[0][0], q[2] - ln[0][2])))
  assert.ok(spanXZ > 5, 'picked a circle, not the vertical seam line')
})

test('store path: pick that rim, 1 mm chamfer previews and commits', async () => {
  assert.ok(await g().applyFeatures(CUP, 'cup'))
  g().toggleEdgeRoundPick('chamfer')
  g().roundEdgeAt([20, -34.641 * 39.7 / 40, -40])   // three 坐標 (x, z, -y)
  await wait(1200)
  assert.equal(g().edgeRoundPicks.length, 1)
  assert.ok(g().edgeRoundPickLines[0].every((q) => Math.abs(Math.hypot(q[0], q[2]) - 40) < 0.05))
  g().setEdgeRoundSize(1)
  for (let i = 0; i < 60 && (g().roundPreviewBusy || (!g().roundPreviewMesh && !g().roundPreviewFail)); i++) await wait(250)
  assert.ok(g().roundPreviewMesh && !g().roundPreviewFail, g().status)
  await g().commitEdgeRound()
  assert.ok(g().features.some((f) => f.type === 'chamfer'))
  assert.equal(g().failedFeatureIds.length, 0)
})

test('failure text names the real cause in Traditional Chinese', () => {
  assert.match(roundFailText('倒角', 'no edges near points', null), /找不到/)
  assert.match(roundFailText('倒角', 'BRep_API: command not done', false), /與數值無關/)
  assert.match(roundFailText('倒角', 'BRep_API: command not done', true), /倒角距離太大/)
  assert.match(roundFailText('倒角', 'chamfer near points failed', true), /倒角距離太大/)   // 通用內核失敗 ≠ 棱搵唔返
  assert.match(roundFailText('圓角', '', true), /圓角半徑太大/)
})
test('done', () => setTimeout(() => process.exit(process.exitCode || 0), 50))
