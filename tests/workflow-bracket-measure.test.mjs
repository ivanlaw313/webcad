// WORKFLOW（測試員支架個案）#1/#2/#3/#4/#5/#6/#7：
// 兩圓柱孔 → 軸距（平行軸）＋最短距離；兩平行平面 → 厚度（面距）；讀數正式繁體；新建／開啟清走分析；
// 剖切關閉移除節點；匯出檔名預設；屬性列體積＝B-rep 精確體積；新建檔案主按鈕「不儲存」。
import test from 'node:test'; import assert from 'node:assert/strict'; import { register, createRequire } from 'node:module'; import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); const w = globalThis.__wheelWorker; await w.ready()
const { useApp, clearedAnalysesPatch, defaultExportBaseName, exportFileNameFrom } = await import('../src/store.ts')
const { combineMeasure } = await import('../src/cad/measureCombine.ts')
const g = () => useApp.getState()
const near = (a, b, t = 1e-3) => assert.ok(Math.abs(a - b) <= t, `${a} != ${b}`)
// 60×40×10 支架，兩個 Ø8 通孔（X=15 / X=45，軸沿 Z）→ 軸距 30、孔壁最短距離 30−8 = 22、板厚 10
const BRACKET = [
  { id: 'b', type: 'extrude', profile: { kind: 'rect', a: [0, -20], b: [60, 20] }, height: 10, operation: 'new' },
  { id: 'h1', type: 'extrude', profile: { kind: 'circle', c: [15, 0], r: 4 }, height: 30, baseZ: -10, operation: 'cut' },
  { id: 'h2', type: 'extrude', profile: { kind: 'circle', c: [45, 0], r: 4 }, height: 30, baseZ: -10, operation: 'cut' },
]
const SC = /[两个这为没对实测选边线点简离积长径补坐组拣揀唔嘅咗喺]/

test('worker: cylinder faces report their axis; planar faces report origin + outward normal; face-face min distance', async () => {
  const m = await w.rebuild(BRACKET)
  assert.ok(m && m.triangles.length)
  const c1 = await w.measureFaceAt([11, 0, 5]), c2 = await w.measureFaceAt([49, 0, 5])
  assert.ok(/cylind/i.test(c1.kind) && c1.axisD && c2.axisD, JSON.stringify(c1))
  near(Math.abs(c1.axisD[2]), 1); near(c1.radius, 4)
  const top = await w.measureFaceAt([30, 10, 10]), bot = await w.measureFaceAt([30, 10, 0])
  assert.ok(top.planeN && bot.planeN)
  near(top.planeN[2], 1); near(bot.planeN[2], -1)
  const md = await w.measureFaceFaceMin([11, 0, 5], [49, 0, 5])
  near(md.dist, 22, 1e-3)
})

test('combine: two parallel holes → 軸距 30 + 最短距離 22 (not an angle error)', async () => {
  await w.rebuild(BRACKET)
  const a = await w.measureFaceAt([11, 0, 5]), b = await w.measureFaceAt([49, 0, 5])
  const md = await w.measureFaceFaceMin([11, 0, 5], [49, 0, 5])
  const r = combineMeasure([{ ...a, kind: 'face', surfType: a.kind, normal: [1, 0, 0] }, { ...b, kind: 'face', surfType: b.kind, normal: [-1, 0, 0] }], { faceMinDist: md.dist })
  assert.equal(r.type, 'distance'); assert.match(r.label, /軸距/); near(r.value, 30); near(r.minDist, 22)
})

test('combine: top + bottom planar faces → 厚度（面距）10; same-direction parallel faces → 面距; tilted faces → 夾角 + 最短距離', () => {
  const t = combineMeasure([{ kind: 'face', planeO: [0, 0, 10], planeN: [0, 0, 1], normal: [0, 0, 1] }, { kind: 'face', planeO: [5, 5, 0], planeN: [0, 0, -1], normal: [0, 0, -1] }], { faceMinDist: 10 })
  assert.equal(t.label, '厚度（面距）'); near(t.value, 10)
  const gap = combineMeasure([{ kind: 'face', planeO: [20, 0, 5], planeN: [1, 0, 0] }, { kind: 'face', planeO: [40, 0, 5], planeN: [-1, 0, 0] }])
  assert.equal(gap.label, '間隙（面距）'); near(gap.value, 20)
  const s = combineMeasure([{ kind: 'face', planeO: [0, 0, 10], planeN: [0, 0, 1], normal: [0, 0, 1] }, { kind: 'face', planeO: [0, 0, 4], planeN: [0, 0, 1], normal: [0, 0, 1] }])
  assert.equal(s.label, '面距（平行面）'); near(s.value, 6)
  const same = combineMeasure([{ kind: 'face', planeO: [0, 0, 10], planeN: [0, 0, 1], normal: [0, 0, 1] }, { kind: 'face', planeO: [3, 0, 10], planeN: [0, 0, 1], normal: [0, 0, 1] }])
  assert.equal(same.type, 'unsupported'); assert.match(same.note, /共面/)
  const ang = combineMeasure([{ kind: 'face', planeO: [0, 0, 0], planeN: [1, 0, 0], normal: [1, 0, 0] }, { kind: 'face', planeO: [0, 0, 0], planeN: [0, 1, 0], normal: [0, 1, 0] }], { faceMinDist: 3.5 })
  assert.equal(ang.type, 'angle'); near(ang.value, 90); near(ang.minDist, 3.5)
  const skew = combineMeasure([{ kind: 'face', axisO: [0, 0, 0], axisD: [0, 0, 1] }, { kind: 'face', axisO: [10, 0, 0], axisD: [1, 0, 0] }], { faceMinDist: 4 })
  assert.equal(skew.label, '最短距離'); near(skew.value, 4); near(skew.axisAngle, 90)
})

test('measure readouts are formal Traditional (no Simplified / colloquial)', () => {
  const cases = [
    combineMeasure([{ kind: 'face', normal: [1, 0, 0] }, { kind: 'face', normal: [1, 0, 0] }]),
    combineMeasure([{ kind: 'face' }, { kind: 'face' }]),
    combineMeasure([{ kind: 'edge', mid: [0, 0, 0], dir: [1, 0, 0] }, { kind: 'edge', mid: [0, 0, 5], dir: [1, 0, 0] }]),
    combineMeasure([{ kind: 'edge', mid: [0, 0, 0] }, { kind: 'face', center: [0, 0, 1], normal: [0, 0, 1] }]),
    combineMeasure([{ kind: 'point', p: [0, 0, 0] }, { kind: 'face', center: [0, 0, 1], normal: [0, 0, 1] }]),
    combineMeasure([{ kind: 'point', p: [0, 0, 0] }, { kind: 'edge', mid: [0, 0, 1] }]),
    combineMeasure([{ kind: 'point', p: [0, 0, 0] }, { kind: 'body', volume: 1 }]),
    combineMeasure([{ kind: 'point', p: [0, 0, 0] }, { kind: 'point', p: [1, 0, 0] }, { kind: 'point', p: [2, 0, 0] }]),
    combineMeasure([{ kind: 'edge', length: 3 }]), combineMeasure([{ kind: 'edge', length: 3, radius: 1, closed: true }]), combineMeasure([{ kind: 'face', area: 3 }]),
  ]
  for (const r of cases) {
    const txt = [r.label, r.note || '', ...r.parts.map((p) => p.label)].join(' ')
    assert.ok(!SC.test(txt), `Simplified/colloquial: ${txt}`)
  }
})

test('store: two hole faces picked through the measure command give 軸距 + 最短距離 in the readout', async () => {
  assert.ok(await g().applyFeatures(BRACKET, 'bracket'))
  useApp.setState({ measureUniMode: true, measureSelFilter: { face: true, edge: false, body: false, sketch: false }, measureUniPicks: [] })
  // three 座標 = (x, z, −y)；CAD (11,0,5) → three (11,5,0)
  await g().pickMeasureUniAt([11, 5, 0], [1, 0, 0], false)
  await g().pickMeasureUniAt([49, 5, 0], [-1, 0, 0], false)
  const r = g().measureUniResult
  assert.match(r.label, /軸距/); near(r.value, 30); near(r.minDist, 22)
  assert.match(g().status, /軸距.*30.*最短距離.*22/)
})

test('status-bar volume source: rebuild carries the exact B-rep volume (same as measure body)', async () => {
  assert.ok(await g().applyFeatures(BRACKET, 'bracket'))
  const ve = g().bodyMesh.volumeExact
  const exact = 60 * 40 * 10 - 2 * Math.PI * 16 * 10
  near(ve, exact, 1e-3)
  useApp.setState({ measureSelFilter: { face: false, edge: false, body: true, sketch: false }, measureUniPicks: [] })
  await g().pickMeasureUniAt([30, 5, -10], null, false)
  near(g().measureUniPicks.at(-1).volume, ve, 1e-6)
})

test('new file / open clear every analysis (section + cap, draft, slope, access, shading, nodes); closing section removes its tree node', async () => {
  assert.ok(await g().applyFeatures(BRACKET, 'bracket'))
  g().setSection({ on: true, axis: 'X', offset: 30, capped: true })
  assert.ok(g().analyses.some((a) => a.type === 'section' && a.visible))
  g().closeSection()
  assert.equal(g().section.on, false); assert.ok(!g().analyses.some((a) => a.type === 'section'), 'no grey 剖切分析 row left')
  g().setSection({ on: true, capped: true, flip: true })
  useApp.setState({ inspectShade: 'zebra', draftResult: { x: 1 } })
  await g().reset()
  const p = clearedAnalysesPatch(), s = g()
  assert.equal(s.section.on, false); assert.equal(s.section.capped, false); assert.equal(s.section.flip, false)
  assert.equal(s.inspectShade, 'off'); assert.equal(s.draftResult, null); assert.deepEqual(s.analyses, []); assert.equal(s.sectionResult, null)
  assert.deepEqual(Object.keys(p).sort(), ['accessResult', 'analyses', 'draftResult', 'inspectShade', 'section', 'sectionCapStatus', 'sectionResult', 'slopeResult'])
})

test('export file name: defaults to the document name, else the renamed body; user text sanitised + extension once', () => {
  assert.equal(defaultExportBaseName('支架A', ''), '支架A')
  assert.equal(defaultExportBaseName('未命名零件', '支架'), '支架')
  assert.equal(defaultExportBaseName('未命名零件 (2)', ''), '未命名零件 (2)')
  assert.equal(defaultExportBaseName('', ''), '未命名零件')
  assert.equal(exportFileNameFrom('支架 v2.stl', '.stl'), '支架_v2.stl')
  assert.equal(exportFileNameFrom('bracket', '.step'), 'bracket.step')
})

test('export STL asks for a file name (default = document name) and cancel downloads nothing', async () => {
  assert.ok(await g().applyFeatures(BRACKET, 'bracket'))
  useApp.setState({ projectName: '支架B', lang: 'zh-HK' })
  const p = g().exportStl()
  await new Promise((r) => setTimeout(r, 50))
  const d = g().uiDialog
  assert.equal(d?.kind, 'prompt'); assert.equal(d.def, '支架B'); assert.match(d.title, /匯出 STL/)
  g().resolveDialog(null); await p
  assert.match(g().status, /已取消匯出 STL/)
})

test('新建檔案 confirm main button reads 不儲存 (Formal Traditional discard)', async () => {
  useApp.setState({ lang: 'zh-HK' })
  void g().newFileFlow()
  await new Promise((r) => setTimeout(r, 30))
  const d = g().uiDialog
  assert.equal(d?.okLabel, '不儲存')
  assert.equal(d?.alt, '儲存')
  assert.equal(d?.title, '開新檔案')
  assert.match(d?.msg || '', /不儲存/)
})
