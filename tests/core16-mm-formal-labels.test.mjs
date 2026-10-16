/**
 * CORE16 residual more9: Units/display — sample Formal Traditional Chinese labels
 * for mm numeric display (unitPresets + fmtLenU + setUnitPreset status + Timeline chip mm).
 * Complements viewx2 (preset math) / toast-formal-tc without re-testing conversion tables.
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
const { useApp, fmtLen } = await import('../src/store.ts')
const {
  UNIT_PRESETS,
  presetById,
  fmtLenU,
  LEN_SUFFIX,
} = await import('../src/cad/unitPresets.ts')
const { chamferTimelineParamSummary } = await import('../src/ui/chamferLabel.ts')
const { extrudeTimelineParamSummary } = await import('../src/ui/extrudeLabel.ts')
const { toLenInput } = await import('../src/io/units.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

test('UNIT_PRESETS mm_g Formal TC label includes 毫米 (not colloquial / SC-only)', () => {
  const mmg = UNIT_PRESETS.find((p) => p.id === 'mm_g')
  assert.ok(mmg, 'mm_g preset')
  assert.equal(mmg.len, 'mm')
  assert.equal(mmg.label, '毫米 / 克 (mm, g)')
  assert.match(mmg.label, /毫米/)
  assert.match(mmg.label, /\(mm, g\)/)
  assert.doesNotMatch(mmg.label, COLLOQ)
  // All length presets use Formal written TC names
  const labels = UNIT_PRESETS.map((p) => p.label)
  assert.ok(labels.some((l) => l.includes('毫米')))
  assert.ok(labels.some((l) => l.includes('厘米')))
  assert.ok(labels.some((l) => l.includes('英寸')))
  for (const l of labels) {
    assert.doesNotMatch(l, COLLOQ)
    assert.doesNotMatch(l, /顯示用/)  // label itself is just name; status adds 顯示用
  }
  assert.equal(presetById('mm_g')?.label, '毫米 / 克 (mm, g)')
})

test('fmtLenU / fmtLen: mm numeric display sample (N.N mm Formal suffix)', () => {
  assert.equal(LEN_SUFFIX.mm, 'mm')
  assert.equal(fmtLenU(12.34, 'mm'), '12.3 mm')
  assert.equal(fmtLenU(40, 'mm', 0), '40 mm')
  assert.equal(fmtLenU(2.5, 'mm', 1), '2.5 mm')
  assert.match(fmtLenU(10, 'mm'), /\d+(\.\d+)? mm$/)
  // store fmtLen wraps unitPresets for mm
  assert.equal(fmtLen(12.34, 'mm'), '12.3 mm')
  assert.equal(fmtLen(40, 'mm', 0), '40 mm')
  assert.doesNotMatch(fmtLen(12.34, 'mm'), COLLOQ)
  assert.doesNotMatch(fmtLen(12.34, 'mm'), /毫米/)  // numeric suffix stays "mm" (ISO); Formal name is in preset label
})

test('toLenInput mm: chip/dialog buffer shows bare numeric (unit suffix beside field)', () => {
  assert.equal(toLenInput(12, 'mm'), '12')
  assert.equal(toLenInput(2.5, 'mm'), '2.5')
  assert.equal(toLenInput(0.1, 'mm'), '0.1')
})

test('setUnitPreset mm_g: status Formal 單位：毫米 / 克 …（顯示用；模型/匯出恆 mm）', () => {
  reset()
  g().setUnitPreset('mm_g')
  assert.equal(g().unit, 'mm')
  assert.equal(g().unitPreset, 'mm_g')
  assert.match(g().status, /^單位：毫米 \/ 克 \(mm, g\)/)
  assert.match(g().status, /顯示用/)
  assert.match(g().status, /模型\/匯出恆 mm/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /显示用|导出恒|单位：/)
})

test('Timeline chip summaries: mm numeric Formal (距離 / 高度 …mm)', () => {
  assert.equal(chamferTimelineParamSummary({ distance: 2 }), '距離 2mm')
  assert.match(extrudeTimelineParamSummary({ height: 30, operation: 'new' }) ?? '', /高度 30mm/)
  const tl = rd('src/components/Timeline.tsx')
  // Fillet/chamfer quick-edit fields advertise unit mm next to NumField
  assert.match(tl, /fillet:[\s\S]{0,80}?unit: 'mm'/)
  assert.match(tl, /chamfer:[\s\S]{0,120}?unit: 'mm'/)
  assert.match(tl, /\{fd\.unit\}/)
  assert.match(tl, /\{meta\.unit\}/)
})

test('source: setUnitPreset / UNIT_PRESETS Formal 毫米 wired in store', () => {
  const st = rd('src/store.ts')
  const up = rd('src/cad/unitPresets.ts')
  assert.match(up, /label: '毫米 \/ 克 \(mm, g\)'/)
  assert.match(st, /單位：\$\{d\.label\}（顯示用；模型\/匯出恆 mm）/)
  // Labels only (comments may use colloquial Cantonese — Formal gate is runtime labels)
  const labelLits = [...up.matchAll(/label:\s*'([^']*)'/g)].map((m) => m[1])
  assert.ok(labelLits.length >= 5, labelLits)
  for (const l of labelLits) {
    assert.doesNotMatch(l, COLLOQ)
    assert.doesNotMatch(l, /显示用|单位：/)
  }
  assert.ok(labelLits.some((l) => l.includes('毫米')))
  assert.doesNotMatch(up, /label: '毫米\/克/)  // space around /
})
