/**
 * CORE16 residual more14: Measure area / length Formal Traditional Chinese units.
 * Labels 面積／稜長／長度; ISO suffixes mm / cm²; preset Formal 毫米.
 * Complements fishing12 / measure-uni-face-readout / core16-mm-formal-labels.
 * Note: product area readout uses cm² (not 平方毫米) by design in measureFmt.
 */
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
const { useApp, fmtLen, fmtArea } = await import('../src/store.ts')
const { combineMeasure } = await import('../src/cad/measureCombine.ts')
const { fmtLenP, fmtAreaP } = await import('../src/cad/measureFmt.ts')
const { UNIT_PRESETS, LEN_SUFFIX } = await import('../src/cad/unitPresets.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', unit: 'mm', unitPreset: 'mm_g', appConfirm: async () => true }, true)
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /面积|长度|棱长|周长|弧长|圆柱面/

test('fmtLen / fmtArea Formal sample: mm length + metric area (cm²); preset 毫米', () => {
  assert.equal(LEN_SUFFIX.mm, 'mm')
  assert.equal(fmtLen(40, 'mm', 0), '40 mm')
  assert.equal(fmtLenP(12.34, 'mm'), '12.3 mm')
  assert.match(fmtLen(80, 'mm'), /\d+(\.\d+)? mm$/)
  // measureFmt: metric area → cm² (100 mm² = 1 cm²); not 平方毫米 string
  assert.equal(fmtArea(1000, 'mm', 1), '10.0 cm²')
  assert.equal(fmtAreaP(2400, 'mm'), '24.0 cm²')
  assert.match(fmtArea(400, 'mm'), /cm²/)
  const mmg = UNIT_PRESETS.find((p) => p.id === 'mm_g')
  assert.ok(mmg)
  assert.equal(mmg.label, '毫米 / 克 (mm, g)')
  assert.match(mmg.label, /毫米/)
  assert.doesNotMatch(mmg.label, COLLOQ)
  // 平方毫米 not used as Formal readout suffix (ISO cm² for area)
  const mf = rd('src/cad/measureFmt.ts')
  assert.doesNotMatch(mf, /平方毫米/)
  assert.match(mf, /cm²/)
})

test('combineMeasure Formal TC labels: 面積 / 稜長 (not SC 面积/长度)', () => {
  const area = combineMeasure([{ kind: 'face', area: 1200, surfType: 'PLANE' }])
  assert.equal(area.type, 'area')
  assert.equal(area.label, '面積')
  assert.equal(area.valueUnit, 'area')
  assert.doesNotMatch(area.label, SC)
  assert.doesNotMatch(area.label, COLLOQ)

  const edge = combineMeasure([{ kind: 'edge', length: 40 }])
  assert.equal(edge.type, 'length')
  assert.equal(edge.label, '稜長')
  assert.equal(edge.valueUnit, 'len')
  assert.equal(edge.value, 40)
  assert.doesNotMatch(edge.label, SC)

  const cyl = combineMeasure([{ kind: 'face', area: 942.48, radius: 5, surfType: 'CYLINDRE' }])
  assert.equal(cyl.type, 'length')
  assert.match(cyl.label, /圓柱面直徑Ø/)
  assert.equal(cyl.value, 10)
  assert.doesNotMatch(cyl.label, SC)
})

test('runtime: measure face → status 面積 + fmtArea Formal (cm² / mm path)', async () => {
  reset()
  const BOX = [{ id: 'b', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [40, 30] }, height: 20, operation: 'new' }]
  assert.ok(await g().applyFeatures(BOX, 'box'), g().status)
  useApp.setState({
    measureUniMode: true,
    measureSelFilter: { face: true, edge: false, body: false, sketch: false },
    measureUniPicks: [],
    measureUniResult: null,
  })
  // top face CAD (20,15,20) → three (20,20,-15)
  await g().pickMeasureUniAt([20, 20, -15], [0, 1, 0], false)
  const r = g().measureUniResult
  assert.ok(r, 'face readout')
  assert.equal(r.label, '面積')
  assert.equal(r.valueUnit, 'area')
  assert.ok(r.value != null && Math.abs(r.value - 1200) < 1, `top area ~1200 got ${r.value}`)
  assert.match(g().status, /面積/)
  assert.match(g().status, /cm²/)
  assert.doesNotMatch(g().status, SC)
  assert.doesNotMatch(g().status, COLLOQ)
})

test('runtime: measure edge 稜長 → status uses fmtLen … mm Formal', async () => {
  reset()
  const BOX = [{ id: 'b', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }]
  assert.ok(await g().applyFeatures(BOX, 'box'), g().status)
  // Simulate unified measure edge pick via addMeasureUniPick (length mm)
  g().addMeasureUniPick({ kind: 'edge', length: 40 })
  const r = g().measureUniResult
  assert.equal(r.label, '稜長')
  assert.equal(r.value, 40)
  assert.equal(r.valueUnit, 'len')
  assert.match(g().status, /稜長/)
  assert.match(g().status, /40(\.0)? mm/)
  assert.doesNotMatch(g().status, SC)
})

test('source: addMeasureUniPick formats area/len via fmtArea/fmtLen; Formal 面積 wired', () => {
  const st = rd('src/store.ts')
  assert.match(st, /if \(r\.valueUnit === 'len'\) head = `\$\{r\.label\} \$\{fmtLen/)
  assert.match(st, /else if \(r\.valueUnit === 'area'\) head = `\$\{r\.label\} \$\{fmtArea/)
  const mc = rd('src/cad/measureCombine.ts')
  assert.match(mc, /label: '面積'/)
  assert.match(mc, /label: '稜長'|return \{ label: '稜長'/)
  assert.doesNotMatch(mc, /label: '面积'/)
  assert.doesNotMatch(mc, /label: '长度'/)
})
