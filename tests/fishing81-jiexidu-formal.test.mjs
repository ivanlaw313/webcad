/**
 * FISHING81: Formal 分辨率→解析度 on FEA/analysis user chrome (TC).
 * Soft Formal tip invent forbidden; user-visible panel/status Formal only.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING81 FEA panel label 解析度 not 分辨率', () => {
  const vp = read('src/components/Viewport.tsx')
  assert.match(vp, />解析度<\/span>/)
  assert.doesNotMatch(vp, />分辨率<\/span>/)
  assert.match(vp, /降解析度再用/)
  assert.match(vp, /3 檔體素解析度\(20\/28\/40\)/)
})

test('FISHING81 store/i18n FEA status 解析度 + 再設定溫度', () => {
  const st = read('src/store.ts')
  const i18n = read('src/i18n.ts')
  assert.match(st, /已選受力面 — 設定力\/方向\/材料\/解析度/)
  assert.doesNotMatch(st, /已選受力面 — 設定力\/方向\/材料\/分辨率/)
  assert.match(i18n, /已選受力面 — 設定力\/方向\/材料\/解析度/)
  assert.match(st, /收斂研究：跑 3 檔解析度/)
  assert.match(st, /收斂研究：第 \$\{li \+ 1\}\/3 檔（解析度/)
  assert.match(st, /收斂研究失敗（解析度/)
  assert.match(st, /再設定溫度，按面板「熱分析/)
  assert.doesNotMatch(st, /再設溫度，按面板「熱分析/)
})

test('FISHING81 ribbon tip.fea punctuation + MATERIALS SC kept', () => {
  const rb = read('src/ribbon.ts')
  const st = read('src/store.ts')
  assert.match(rb, /出應力雲圖。紅色 = 最受力/)
  assert.doesNotMatch(rb, /出應力雲圖,紅色/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /export const MATERIALS:/)
})
