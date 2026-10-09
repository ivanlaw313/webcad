// CORE16／孔：盲孔深度 0＝自動 ≈1.5×Ø（落 cut height／hole.depth）；超過實體厚度時 holeBlindOverrun 警告（容許但講明）。
// Ø≤0 拒絕見 grok-qa-v1.9；呢度補 depth 預設同 overrun。
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, holeBlindOverrun } = await import('../src/store.ts')
const g = () => useApp.getState()

async function box(a = 40, b = 40, c = 10) {
  useApp.setState(useApp.getInitialState(), true)
  useApp.setState({ lang: 'zh-HK' })
  const f = { id: 'box', type: 'prim', shape: 'box', a, b, c, op: 'new' }
  assert.equal(await g().applyFeatures([f], 'box'), true, g().status)
}

test('holeBlindOverrun: depth ≥ body thickness along drill dir → {thick}; through/toNext skip', async () => {
  await box(40, 40, 10)
  useApp.setState({ holeThrough: false, holeToNext: false, holeToObject: false, holeDepth: 5, holeDir: [0, 0, 1] })
  assert.equal(holeBlindOverrun(g()), null, 'depth 5 < thick 10')
  useApp.setState({ holeDepth: 10 })
  const ov = holeBlindOverrun(g())
  assert.ok(ov && ov.thick > 9 && ov.thick < 11, JSON.stringify(ov))
  useApp.setState({ holeDepth: 50 })
  assert.ok(holeBlindOverrun(g())?.thick)
  useApp.setState({ holeThrough: true, holeDepth: 50 })
  assert.equal(holeBlindOverrun(g()), null)
  useApp.setState({ holeThrough: false, holeToNext: true, holeDepth: 50 })
  assert.equal(holeBlindOverrun(g()), null)
  useApp.setState({ holeToNext: false, holeDepth: 0 })
  assert.equal(holeBlindOverrun(g()), null, 'auto depth (0) does not warn')
})

test('blind hole depth 0 → cut/hole uses ≈1.5×Ø; deep depth kept + overrun status note', async () => {
  await box(40, 40, 10)
  // holePos three-world on top; path may expand to extrude-cut（斜面盲孔）or type:hole — both bake 1.5×Ø when depth=0
  useApp.setState({
    holeMode: true, holeType: 'simple', holeThrough: false, holeToNext: false, holeToObject: false,
    holePos: [0, 10, 0], holeFaceZ: 10, holeD: 4, holeDepth: 0, holeClearance: 0, holeDir: [0, 0, 1],
  })
  const n0 = g().features.length
  await g().commitHole()
  assert.ok(g().features.length > n0, g().status)
  const hole = g().features.find((f) => f.type === 'hole')
  const cut = [...g().features].reverse().find((f) => f.type === 'extrude' && f.operation === 'cut')
  if (hole) {
    assert.ok(Math.abs(hole.depth - 6) < 1e-9, `hole.depth ${hole.depth}`)
  } else {
    assert.ok(cut, 'expected hole feature or cut extrude: ' + g().status)
    assert.ok(Math.abs(cut.height - 6) < 1e-6, `cut height ${cut.height}`)
  }
  assert.match(g().status, /深\s*6|Ø4/)
  assert.doesNotMatch(g().status, /已超過實體厚度/)

  await box(40, 40, 10)
  useApp.setState({
    holeMode: true, holeType: 'simple', holeThrough: false, holeToNext: false, holeToObject: false,
    holePos: [5, 10, 5], holeFaceZ: 10, holeD: 4, holeDepth: 20, holeClearance: 0, holeDir: [0, 0, 1],
  })
  assert.ok(holeBlindOverrun(g()), 'pre-commit overrun detect')
  const f0 = g().features.length
  await g().commitHole()
  assert.ok(g().features.length > f0, g().status)
  assert.match(g().status, /已超過實體厚度|等同貫通/)
})

test('setHoleDepth(≤0) stores 0 (auto); positive kept — no silent 1.5 write-back into state', () => {
  useApp.setState({ ...useApp.getInitialState(), holeDepth: 8 }, true)
  g().setHoleDepth(0)
  assert.equal(g().holeDepth, 0)
  g().setHoleDepth(-3)
  assert.equal(g().holeDepth, 0)
  g().setHoleDepth(7.5)
  assert.equal(g().holeDepth, 7.5)
})
