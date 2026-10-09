// UX2 #11：flange 杯（旋轉 → 抽殼 2 → 倒角）存檔／重開（= 硬刷新自動存檔還原）之後，抽殼面綁定要確定：
// 唔可以出「所選面搵唔返，已改用最近嘅面（相差 14.8 mm）」或 S1 追蹤警告；幾何同存檔前一致。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); const w = globalThis.__wheelWorker; await w.ready()
const { useApp, buildProjectPayload } = await import('../src/store.ts')
const g = () => useApp.getState()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const prof = { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }
const CUP = [{ id: 'r', type: 'revolve', profile: prof, angle: 360, axis: 'Y', op: 'new' }, { id: 's', type: 'shell', thickness: 2, nears: [[10, 40, 0]], tangentChain: false, direction: 'inside' }]
const vol = () => { const m = g().bodyMesh; let v = 0; const V = m.vertices, T = m.triangles; for (let i = 0; i < T.length; i += 3) { const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3; v += (V[a] * (V[b + 1] * V[c + 2] - V[b + 2] * V[c + 1]) - V[a + 1] * (V[b] * V[c + 2] - V[b + 2] * V[c]) + V[a + 2] * (V[b] * V[c + 1] - V[b + 1] * V[c])) / 6 } return Math.abs(v) }
const bad = (ws) => ws.filter((x) => /持久面名|面[拣揀]|搵唔返|S1-面|近点|近點/.test(x))

test('cup shell (+chamfer) survives save → reopen twice with no face-drift warning and identical geometry', async () => {
  await g().reset()
  assert.ok(await g().applyFeatures(CUP, 'cup'))
  g().toggleEdgeRoundPick('chamfer'); g().roundEdgeAt([20, -34.641 * 39.7 / 40, -40]); await wait(1200)
  g().setEdgeRoundSize(1)
  for (let i = 0; i < 60 && (g().roundPreviewBusy || (!g().roundPreviewMesh && !g().roundPreviewFail)); i++) await wait(250)
  await g().commitEdgeRound()
  assert.equal(g().features.length, 3, g().status)
  const shell0 = JSON.stringify(g().features[1]), v0 = vol()
  assert.ok(g().features[1].faceFp?.length, 'shell face fingerprint stamped')
  for (let round = 0; round < 2; round++) {
    const data = JSON.parse(JSON.stringify(buildProjectPayload(g())))
    await g().reset()
    await g().applyProjectData(data)
    await wait(500)
    assert.deepEqual(bad(g().lastBuildWarnings), [], `round ${round}: ${JSON.stringify(g().lastBuildWarnings)}`)
    assert.equal(JSON.stringify(g().features[1]), shell0, 'binding unchanged')
    assert.ok(Math.abs(vol() - v0) < 1e-3 * v0, `volume ${vol()} vs ${v0}`)
  }
})

test('worker: an UNMESHED fresh shape resolves the stored shell face exactly (no near-point fallback)', async () => {
  await g().reset()
  assert.ok(await g().applyFeatures(CUP, 'cup'))
  const s = g().features[1]
  // fresh worker rebuild of exactly the saved features (cache-cold body, like a hard refresh)
  const m = await w.rebuild([{ ...CUP[0], id: 'r2' }, { ...s, id: 's2' }])
  assert.ok(m && m.triangles.length)
  assert.deepEqual(bad(m.warnings ?? []), [], JSON.stringify(m.warnings))
})
