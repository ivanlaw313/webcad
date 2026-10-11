// FISHING17 P3：編輯現有帶導軌嘅放樣時，開對話框要由特徵回填 loftRail（同截面清單），
// 導軌 chip／下拉唔可以空住但預覽仍用舊 rails。Formal Traditional zh-HK。
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
const reset = () => useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)

test('APP_VERSION 2.20', () => {
  const v = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
  assert.match(v, /APP_VERSION = '2\.20'/)
})

test('edit open refills loftRail + section list from feature (chip matches model)', async () => {
  reset()
  for (const [z, shape] of [
    [0, { type: 'rect', a: [-20, -20], b: [20, 20] }],
    [60, { type: 'circle', c: [0, 0], r: 15 }],
  ]) {
    g().sketchOnDatumPlane('XY', z)
    useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] })
    await g().commitStandaloneSketch()
  }
  const sks = g().features.filter((f) => f.type === 'sketch').map((f) => f.sketchId)
  assert.equal(sks.length, 2)
  g().addLoftSectionFromSketch(sks[0])
  g().addLoftSectionFromSketch(sks[1])
  assert.equal(g().loftSections.length, 2)
  // 導軌草圖：XY 開放折線，每截面一點
  useApp.setState({
    sketchSources: {
      ...g().sketchSources,
      skRail: {
        name: '導軌',
        plane: 'XY',
        baseZ: 0,
        shapes: [{ type: 'poly', open: true, pts: [[20, 0], [35, 5]] }],
        cons: [],
      },
    },
  })
  g().setLoftRailFromSketch('skRail')
  assert.deepEqual(g().loftRail, [[20, 0], [35, 5]], g().status)
  g().openLoftDlg()
  await g().commitLoft()
  const loft = g().features.find((f) => f.type === 'loft')
  assert.ok(loft?.rails?.[0]?.length === 2, 'committed loft stores rails: ' + g().status)
  assert.equal(g().loftRail, null, 'commit clears dialog loftRail')
  assert.deepEqual(loft.sketchIds, sks)

  // 開編輯：必須回填 loftRail + 截面清單（以前 chip 空、預覽仍用 rails）
  g().openFeatDlgForEdit(loft.id)
  await new Promise((r) => setTimeout(r, 300))
  assert.equal(g().loftDlgOpen, true)
  assert.equal(g().loftEditId, loft.id)
  assert.equal(g().loftSections.length, 2, 'section list refilled')
  assert.equal(g().loftSecSrcs.length, 2, 'section sources rebuilt from sketchIds')
  assert.ok(g().loftSecSrcs.every((x) => x.skId && x.label), 'rows carry sketch labels')
  assert.ok(g().loftRail && g().loftRail.length === 2, 'loftRail refilled for chip: ' + g().status)
  assert.deepEqual(
    g().loftRail.map((p) => [+p[0].toFixed(6), +p[1].toFixed(6)]),
    [[20, 0], [35, 5]],
    'rail points round-trip profile↔sketch local',
  )
  // status may be overwritten by async gotoStep rollback; loftRail/sections are the contract
})

test('edit open with no rail leaves loftRail null (no stale chip)', async () => {
  reset()
  for (const [z, shape] of [
    [0, { type: 'rect', a: [-10, -10], b: [10, 10] }],
    [40, { type: 'circle', c: [0, 0], r: 8 }],
  ]) {
    g().sketchOnDatumPlane('XY', z)
    useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] })
    await g().commitStandaloneSketch()
  }
  const sks = g().features.filter((f) => f.type === 'sketch').map((f) => f.sketchId)
  g().addLoftSectionFromSketch(sks[0])
  g().addLoftSectionFromSketch(sks[1])
  useApp.setState({ loftRail: null })
  g().openLoftDlg()
  await g().commitLoft()
  const loft = g().features.find((f) => f.type === 'loft')
  assert.ok(loft)
  assert.ok(!loft.rails?.length, 'feature has no rails')
  // dirty leftover in dialog must not survive edit-open when feature has no rails
  useApp.setState({ loftRail: [[9, 9], [8, 8]] })
  g().openFeatDlgForEdit(loft.id)
  await new Promise((r) => setTimeout(r, 200))
  assert.equal(g().loftRail, null, 'edit open clears stale loftRail when feature has no rails')
  assert.equal(g().loftSections.length, 2)
})
