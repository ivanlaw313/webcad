/**
 * FISHING99: Tour UI chrome — en/ja/zh-CN/zh-HK (not TC-only titles for JA/EN).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING99 Tour has JA/ZH_CN/EN/ZH tables + normalizeLang pick', () => {
  const w = read('src/components/Tour.tsx')
  assert.match(w, /const JA: TourCopy = \{/)
  assert.match(w, /title: 'スケッチを作成'/)
  assert.match(w, /const ZH_CN: TourCopy = \{/)
  assert.match(w, /title: '新建草图'/)
  assert.match(w, /const EN: TourCopy = \{/)
  assert.match(w, /title: 'Create a sketch'/)
  assert.match(w, /const ZH: TourCopy = \{/)
  assert.match(w, /title: '新建草圖'/)
  assert.match(w, /normalizeLang\(lang\)/)
  assert.match(w, /L === 'ja' \? JA/)
  // Must not hardcode TC-only STEPS array titles as the only source
  assert.doesNotMatch(w, /const STEPS: Step\[\] = \[/)
})

test('FISHING99 Tour chrome keys + badge/skip/finish pick', () => {
  const w = read('src/components/Tour.tsx')
  assert.match(w, /skipTour:/)
  assert.match(w, /skipStep:/)
  assert.match(w, /finish:/)
  assert.match(w, /next:/)
  assert.match(w, /statusFinish:/)
  assert.match(w, /\{t\.badge\(/)
  assert.match(w, /\{t\.skipTour\}/)
  assert.match(w, /\{t\.finish\}/)
  assert.match(w, /tourAnchor\(/)
})

test('FISHING99 F98 IntroCard + MATERIALS + F94 demold prefix kept', () => {
  const intro = read('src/components/IntroCard.tsx')
  const st = read('src/store.ts')
  const i18n = read('src/i18n.ts')
  assert.match(intro, /title: 'クイックスタート — 3 ステップで最初の部品'/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(i18n, /離型到達性|Demold Accessibility|脫模可達性/)
})
