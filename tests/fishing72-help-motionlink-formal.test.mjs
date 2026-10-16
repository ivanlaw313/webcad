/**
 * FISHING72: help.p4 Formal — 關節面板建關節 + 運動連結 (not 面板連接).
 * Align leftover 連接 wording after F71 panel/button Formal 連結.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING72 help.p4 uses 面板建關節 + 運動連結 not 面板連接', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const m = hk.match(/"help\.p4": "((?:\\"|[^"])*)"/)
  assert.ok(m)
  const t = m[1]
  assert.match(t, /「關節」面板建關節 \+「運動連結」設齒比/)
  assert.doesNotMatch(t, /面板連接/)
  assert.doesNotMatch(t, /運動連接/)
})

test('FISHING72 JointsPanel Formal 運動連結 / + 連結 kept', () => {
  const jp = read('src/components/JointsPanel.tsx')
  assert.match(jp, /運動連結（齒輪比）/)
  assert.match(jp, />\+ 連結</)
  assert.doesNotMatch(jp, /\+ 連接/)
})

test('FISHING72 MATERIALS/DENSITY_PREF SC kept', () => {
  const st = read('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
