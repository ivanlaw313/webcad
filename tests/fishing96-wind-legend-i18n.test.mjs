/**
 * FISHING96: WindLegend / WindPoseCompare UI chrome — en/ja/zh-CN/zh-HK (not TC-only fallback for JA).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING96 WindLegend has JA/ZH_CN tables + normalizeLang pick', () => {
  const w = read('src/components/WindLegend.tsx')
  assert.match(w, /const JA = \{/)
  assert.match(w, /title: '風洞凡例'/)
  assert.match(w, /const ZH_CN = \{/)
  assert.match(w, /title: '风洞图例'/)
  assert.match(w, /normalizeLang\(lang\)/)
  assert.match(w, /L === 'ja' \? JA/)
  assert.doesNotMatch(w, /const t = lang === 'en' \? EN : ZH\b/)
})

test('FISHING96 WindPoseCompare has JA/ZH_CN tables + normalizeLang pick', () => {
  const w = read('src/components/WindPoseCompare.tsx')
  assert.match(w, /const JA = \{/)
  assert.match(w, /title: '風洞姿勢比較'/)
  assert.match(w, /const ZH_CN = \{/)
  assert.match(w, /title: '风洞位姿比较'/)
  assert.match(w, /normalizeLang\(lang\)/)
  assert.match(w, /L === 'ja' \? JA/)
  assert.doesNotMatch(w, /const t = lang === 'en' \? EN : ZH\b/)
})

test('FISHING96 F95 closeDemold + MATERIALS kept', () => {
  const k = read('src/i18n/labelToKey.ts')
  const st = read('src/store.ts')
  assert.match(k, /'關閉脫模可達性':\s*'status\.closeDemold'/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
