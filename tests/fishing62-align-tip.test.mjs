/**
 * FISHING62: tip.align must mention ASSEMBLE「選面配合」(F59 recheck P1).
 * resolveRibbonTip prefers i18n tip.<id> over ribbon.ts fallback.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING62 zh-HK tip.align mentions 選面配合', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  assert.match(hk, /"tip\.align": "對齊：.*選面配合/)
  assert.match(hk, /一次性快捷，不記錄配合/)
  assert.doesNotMatch(hk, /"tip\.align": "對齊：先點基準面再點要移動件的面 —— 平面貼平 \/ 圓柱對準同軸。"/)
})

test('FISHING62 ribbon align tip still mentions 選面配合', () => {
  const rb = read('src/ribbon.ts')
  assert.match(rb, /id: 'align'[\s\S]{0,200}選面配合/)
})

test('FISHING62 tip.joint stays 轉動; MATERIALS SC kept', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const st = read('src/store.ts')
  assert.match(hk, /"tip\.joint": "關節：組件之間建立運動關節（轉動\/滑動\/剛性等）。"/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
