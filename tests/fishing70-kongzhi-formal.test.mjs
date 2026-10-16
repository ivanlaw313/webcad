/**
 * FISHING70: Formal 控製 → 控制 (F66 recheck drivejoints tip typo; Form/editpoles/bspline tips).
 * Not tip-catalog fill — wrong glyph 製 in user-visible Formal tips.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING70 tip.drivejoints + ribbon drivejoints use 播放控制 not 控製', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  assert.match(hk, /"tip\.drivejoints": ".*播放控制驅動裝配。"/)
  assert.match(rb, /id: 'drivejoints'[^}]*?tip: '[^']*播放控制驅動裝配/)
  assert.doesNotMatch(hk, /控製/)
  assert.doesNotMatch(rb, /控製/)
})

test('FISHING70 Form / editpoles / bspline tips use 控制籠／控制點', () => {
  const rb = read('src/ribbon.ts')
  assert.match(rb, /id: 'formcyl'[^}]*?tip: '[^']*控制籠[^']*控制點/)
  assert.match(rb, /id: 'editpoles'[^}]*?tip: '[^']*控制點球/)
  assert.match(rb, /id: 'formsubdiv'[^}]*?tip: '[^']*控制籠細分級/)
  assert.match(rb, /id: 'sk_bspline'[^}]*?tip: '[^']*控製點|控制點/)
  // sk_bspline must be 控制點 (both occurrences)
  const m = rb.match(/id: 'sk_bspline'[^}]*?tip: '((?:\\'|[^'])*)'/)
  assert.ok(m)
  assert.match(m[1], /控制點/)
  assert.doesNotMatch(m[1], /控製/)
})

test('FISHING70 MATERIALS/DENSITY_PREF SC keys kept; no tip Formal invent', () => {
  const st = read('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /MATERIALS/)
})
