/**
 * FISHING74: joint-pick Formal — 轉動／滑動軸 in armed status (F61 PARTIAL);
 * 其連結的組件 not 其連接的組件 (align F71 連結).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING74 startJointPick status has 轉動／滑動軸 + 其連結的組件', () => {
  const st = read('src/store.ts')
  assert.match(st, /圓柱＝轉動／滑動關節／圓柱/)
  assert.match(st, /圓柱↔平面＝轉動／滑動軸取自圓柱並穿面心，預設轉動/)
  assert.match(st, /其連結的組件（父件）/)
  assert.doesNotMatch(st, /其連接的組件/)
})

test('FISHING74 first-pick follow-up status Formal 轉動／滑動軸', () => {
  const st = read('src/store.ts')
  assert.match(st, /請再點選【其連結的組件（父件）】對應面（圓柱或平面皆可 — 圓柱↔平面＝轉動／滑動軸取自圓柱並穿面心）/)
})

test('FISHING74 MATERIALS/DENSITY_PREF SC kept; clarify dialog still 轉動／滑動軸', () => {
  const st = read('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /轉動／滑動軸將取自已選圓柱面/)
})
