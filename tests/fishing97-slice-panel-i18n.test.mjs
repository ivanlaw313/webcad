/**
 * FISHING97: SlicePanel UI chrome — en/ja/zh-CN/zh-HK (not TC-only titles for JA/EN).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING97 SlicePanel has JA/ZH_CN/EN/ZH tables + normalizeLang pick', () => {
  const w = read('src/components/SlicePanel.tsx')
  assert.match(w, /const JA = \{/)
  assert.match(w, /title: 'スライスプレビュー'/)
  assert.match(w, /const ZH_CN = \{/)
  assert.match(w, /title: '切层预览'/)
  assert.match(w, /const EN = \{/)
  assert.match(w, /title: 'Slice preview'/)
  assert.match(w, /const ZH = \{/)
  assert.match(w, /title: '切層預覽'/)
  assert.match(w, /normalizeLang\(lang\)/)
  assert.match(w, /L === 'ja' \? JA/)
  assert.match(w, /titleLong:/)
  // Must not hardcode TC-only dw-head titles anymore
  assert.doesNotMatch(w, /dw-head">🔪 切層預覽/)
})

test('FISHING97 SlicePanel empty/close/legend chrome i18n keys present', () => {
  const w = read('src/components/SlicePanel.tsx')
  assert.match(w, /empty:/)
  assert.match(w, /close:/)
  assert.match(w, /legend:/)
  assert.match(w, /\{t\.title\}/)
  assert.match(w, /\{t\.titleLong\}/)
  assert.match(w, /\{t\.close\}/)
})

test('FISHING97 F96 WindLegend + MATERIALS + F94 demold prefix kept', () => {
  const wl = read('src/components/WindLegend.tsx')
  const st = read('src/store.ts')
  const i18n = read('src/i18n.ts')
  assert.match(wl, /title: '風洞凡例'/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(i18n, /離型到達性|Demold Accessibility|脫模可達性/)
})
