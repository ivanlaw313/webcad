/**
 * FISHING100: JointsPanel UI chrome — en/ja/zh-CN/zh-HK (not TC-only titles for JA/EN).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING100 JointsPanel has JA/ZH_CN/EN/ZH tables + normalizeLang pick', () => {
  const w = read('src/components/JointsPanel.tsx')
  assert.match(w, /const JA: JointsChrome = \{/)
  assert.match(w, /アセンブリジョイント/)
  assert.match(w, /const ZH_CN: JointsChrome = \{/)
  assert.match(w, /装配关节/)
  assert.match(w, /const EN: JointsChrome = \{/)
  assert.match(w, /Assembly joints/)
  assert.match(w, /const ZH: JointsChrome = \{/)
  assert.match(w, /裝配關節/)
  assert.match(w, /normalizeLang\(lang\)/)
  assert.match(w, /L === 'ja' \? JA/)
  assert.match(w, /pickJointsChrome/)
  // Must not hardcode TC-only jp-title 裝配關節 anymore
  assert.doesNotMatch(w, />裝配關節 \{joints\.length\}/)
})

test('FISHING100 JointsPanel section chrome keys + panelTitle wire', () => {
  const w = read('src/components/JointsPanel.tsx')
  assert.match(w, /jointOrigins:/)
  assert.match(w, /rigidGroups:/)
  assert.match(w, /poses:/)
  assert.match(w, /keyframes:/)
  assert.match(w, /motionLinks:/)
  assert.match(w, /\{chrome\.panelTitle\(/)
  assert.match(w, /\{chrome\.jointOrigins\}/)
  assert.match(w, /\{chrome\.rigidGroups\}/)
  assert.match(w, /\{chrome\.poses\}/)
  assert.match(w, /\{chrome\.keyframes\}/)
  assert.match(w, /\{chrome\.motionLinks\}/)
  assert.match(w, /ジョイント原点/)
  assert.match(w, /モーションリンク（ギア比）/)
})

test('FISHING100 F99 Tour + MATERIALS + F94 demold prefix kept', () => {
  const tour = read('src/components/Tour.tsx')
  const st = read('src/store.ts')
  const i18n = read('src/i18n.ts')
  assert.match(tour, /title: 'スケッチを作成'/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(i18n, /離型到達性|Demold Accessibility|脫模可達性/)
})
