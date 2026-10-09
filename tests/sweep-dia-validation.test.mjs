// CORE16 b496265：掃掠管徑 Ø — 0／負數／非數值唔再靜默變 12；setSweepDia 照存，commit 拒絕並講原因，模型不變。
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

async function openSweepWithPath() {
  useApp.setState(useApp.getInitialState(), true)
  useApp.setState({ lang: 'zh-HK' })
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({ polyPts: [[0, 0], [40, 0]], polyBulges: [0], sketchTool: 'polyline' })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources).find((k) => g().sketchSources[k].shapes.some((s) => s.type === 'poly' && s.open))
  assert.ok(pathId, 'open path sketch')
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  useApp.setState({ sketchOp: 'new', sweepSection: 'circle' })
}

test('setSweepDia keeps 0 / negative / NaN policy (no silent clamp to 12)', () => {
  useApp.setState({ ...useApp.getInitialState(), sweepDia: 12, lang: 'zh-HK' }, true)
  g().setSweepDia(0)
  assert.equal(g().sweepDia, 0)
  g().setSweepDia(-5)
  assert.equal(g().sweepDia, -5)
  g().setSweepDia(Number.NaN)
  assert.equal(g().sweepDia, -5, 'NaN must not replace the stored illegal value with 12')
  g().setSweepDia(8)
  assert.equal(g().sweepDia, 8)
  // source pin: CORE16 comment + gate
  const st = read('src/store.ts')
  assert.match(st, /setSweepDia: \(n\) => set\(\(st\) => \(\{ sweepDia: Number\.isFinite\(n\) \? n : st\.sweepDia/)
  assert.match(st, /管徑 Ø 必須大於 0/)
})

test('commitSweepPath rejects Ø≤0 atomically — dialog stays open, no sweep feature', async () => {
  await openSweepWithPath()
  const before = structuredClone(g().features)
  for (const bad of [0, -1, -12]) {
    g().setSweepDia(bad)
    assert.equal(g().sweepDia, bad)
    await g().commitSweepPath()
    assert.equal(g().sweepDlgOpen, true, `dlg must stay open for Ø=${bad}`)
    assert.match(g().sweepError || '', /管徑 Ø 必須大於 0/)
    assert.match(g().status, /掃掠未能建立|管徑/)
    assert.deepEqual(g().features.map((f) => f.id), before.map((f) => f.id), `features mutated for Ø=${bad}`)
    assert.ok(!g().features.some((f) => f.type === 'sweep'))
  }
  // legal value still commits
  g().setSweepDia(6)
  await g().commitSweepPath()
  assert.ok(g().features.some((f) => f.type === 'sweep'), g().status)
  assert.equal(g().sweepDlgOpen, false)
  assert.equal(g().sweepError, null)
})
