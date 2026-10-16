/**
 * FISHING102: PhysicsLab header chrome — en/ja/zh-CN/zh-HK (not TC-only titles for JA/EN).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING102 PhysicsLab has JA/ZH_CN/EN/ZH tables + normalizeLang pick', () => {
  const w = read('src/components/PhysicsLab.tsx')
  assert.match(w, /const JA_PL: PhysicsLabChrome = \{/)
  assert.match(w, /環境シミュレーションラボ/)
  assert.match(w, /const ZH_CN_PL: PhysicsLabChrome = \{/)
  assert.match(w, /环境模拟实验室/)
  assert.match(w, /const EN_PL: PhysicsLabChrome = \{/)
  assert.match(w, /Environment simulation lab/)
  assert.match(w, /const ZH_PL: PhysicsLabChrome = \{/)
  assert.match(w, /環境模擬實驗室/)
  assert.match(w, /normalizeLang\(lang\)/)
  assert.match(w, /L === 'ja' \? JA_PL/)
  assert.match(w, /pickPhysicsLabChrome/)
  // Must not hardcode TC-only header title anymore
  assert.doesNotMatch(w, /<b>🧪 環境模擬實驗室<\/b>/)
  assert.doesNotMatch(w, /aria-label="環境模擬實驗室"/)
})

test('FISHING102 PhysicsLab header chrome keys wired', () => {
  const w = read('src/components/PhysicsLab.tsx')
  assert.match(w, /title:/)
  assert.match(w, /subtitle:/)
  assert.match(w, /building:/)
  assert.match(w, /pause:/)
  assert.match(w, /play:/)
  assert.match(w, /reset:/)
  assert.match(w, /report:/)
  assert.match(w, /closeAria:/)
  assert.match(w, /\{chrome\.title\}/)
  assert.match(w, /\{chrome\.subtitle\}/)
  assert.match(w, /chrome\.building/)
  assert.match(w, /chrome\.pause/)
  assert.match(w, /chrome\.play/)
  assert.match(w, /\{chrome\.reset\}/)
  assert.match(w, /\{chrome\.report\}/)
  assert.match(w, /\{chrome\.closeAria\}/)
  assert.match(w, /一時停止/)
  assert.match(w, /Building physics world/)
})

test('FISHING102 F101 JointOriginPalette + MATERIALS + F94 demold prefix kept', () => {
  const jo = read('src/components/JointOriginPalette.tsx')
  const st = read('src/store.ts')
  const i18n = read('src/i18n.ts')
  assert.match(jo, /ジョイント原点/)
  assert.match(jo, /Joint origin/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(i18n, /離型到達性|Demold Accessibility|脫模可達性/)
})
