/**
 * FISHING82: INSPECT accessanalysis UX unify → 脫模可達性
 * (match 檢查擴展 / analysesModel chip / success status); tip.fea punct leftover.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING82 INSPECT ribbon + zh-HK cmd/tool use 脫模可達性', () => {
  const rb = read('src/ribbon.ts')
  const hk = read('src/i18n/locales/zh-HK.ts')
  // INSPECT block (before 檢查擴展) must not keep short 可達性分析 label
  assert.match(rb, /id: 'accessanalysis', label: '脫模可達性'/)
  assert.doesNotMatch(rb, /id: 'accessanalysis', label: '可達性分析'/)
  assert.match(hk, /"cmd\.accessanalysis": "脫模可達性"/)
  assert.match(hk, /"tool\.accessanalysis": "脫模可達性"/)
  // F55 檢查擴展 entry kept
  assert.match(rb, /FISHING55[\s\S]*id: 'accessanalysis', label: '脫模可達性'/)
})

test('FISHING82 store gate/status Formal 脫模可達性; analyses chip kept', () => {
  const st = read('src/store.ts')
  const am = read('src/cad/analysesModel.ts')
  assert.match(st, /脫模可達性：需要活動實體/)
  assert.match(st, /脫模可達性：脫模方向不可是零向量/)
  assert.match(st, /已關脫模可達性/)
  assert.doesNotMatch(st, /可達性分析：需要活動實體/)
  assert.match(am, /access: '脫模可達性'/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})

test('FISHING82 tip.fea punct leftover + SC FEA 设定力; MATERIALS SC kept', () => {
  const rb = read('src/ribbon.ts')
  const i18n = read('src/i18n.ts')
  const st = read('src/store.ts')
  assert.match(rb, /屬趨勢著色。非商用分析精度/)
  assert.doesNotMatch(rb, /屬趨勢著色,非商用/)
  assert.match(i18n, /受力面 \+ 设定力（同受力云图一样）/)
  assert.match(i18n, /已选受力面 — 设定力\/方向\/材料\/解析度/)
  assert.match(st, /export const MATERIALS:/)
})
