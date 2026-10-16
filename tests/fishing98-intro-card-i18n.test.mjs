/**
 * FISHING98: IntroCard UI chrome — en/ja/zh-CN/zh-HK (not TC-only titles for JA/EN).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING98 IntroCard has JA/ZH_CN/EN/ZH tables + normalizeLang pick', () => {
  const w = read('src/components/IntroCard.tsx')
  assert.match(w, /const JA = \{/)
  assert.match(w, /title: 'クイックスタート — 3 ステップで最初の部品'/)
  assert.match(w, /const ZH_CN = \{/)
  assert.match(w, /title: '快速开始 — 三步做出你的第一个零件'/)
  assert.match(w, /const EN = \{/)
  assert.match(w, /title: 'Quick start — three steps to your first part'/)
  assert.match(w, /const ZH = \{/)
  assert.match(w, /title: '快速開始 — 三步整出你的第一個零件'/)
  assert.match(w, /normalizeLang\(lang\)/)
  assert.match(w, /L === 'ja' \? JA/)
  // Must not hardcode TC-only dw-head titles anymore
  assert.doesNotMatch(w, /dw-head">👋 快速開始/)
})

test('FISHING98 IntroCard chrome keys + t.title pick', () => {
  const w = read('src/components/IntroCard.tsx')
  assert.match(w, /helpBtn:/)
  assert.match(w, /tourBtn:/)
  assert.match(w, /okBtn:/)
  assert.match(w, /\{t\.title\}/)
  assert.match(w, /\{t\.helpBtn\}/)
  assert.match(w, /\{t\.tourBtn\}/)
  assert.match(w, /\{t\.okBtn\}/)
})

test('FISHING98 F97 SlicePanel + MATERIALS + F94 demold prefix kept', () => {
  const sp = read('src/components/SlicePanel.tsx')
  const st = read('src/store.ts')
  const i18n = read('src/i18n.ts')
  assert.match(sp, /title: 'スライスプレビュー'/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(i18n, /離型到達性|Demold Accessibility|脫模可達性/)
})
