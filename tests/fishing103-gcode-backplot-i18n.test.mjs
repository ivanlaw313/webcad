/**
 * FISHING103: GcodeBackplot header chrome — en/ja/zh-CN/zh-HK (not TC-only legend/close for JA/EN).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING103 GcodeBackplot has JA/ZH_CN/EN/ZH tables + normalizeLang pick', () => {
  const w = read('src/components/GcodeBackplot.tsx')
  assert.match(w, /const JA_GB: GcodeBackplotChrome = \{/)
  assert.match(w, /プレビューを閉じる/)
  assert.match(w, /const ZH_CN_GB: GcodeBackplotChrome = \{/)
  assert.match(w, /关闭预览/)
  assert.match(w, /const EN_GB: GcodeBackplotChrome = \{/)
  assert.match(w, /Close preview/)
  assert.match(w, /const ZH_GB: GcodeBackplotChrome = \{/)
  assert.match(w, /關閉預覽/)
  assert.match(w, /normalizeLang\(lang\)/)
  assert.match(w, /L === 'ja' \? JA_GB/)
  assert.match(w, /pickGcodeBackplotChrome/)
  // Must not hardcode TC-only close title anymore
  assert.doesNotMatch(w, /title="關閉預覽"/)
  assert.doesNotMatch(w, /虛线=快移 · 顏色=深度（藍淺紅深）/)
})

test('FISHING103 GcodeBackplot header chrome keys wired', () => {
  const w = read('src/components/GcodeBackplot.tsx')
  assert.match(w, /cutPrefix:/)
  assert.match(w, /deepest:/)
  assert.match(w, /legend:/)
  assert.match(w, /closeTitle:/)
  assert.match(w, /\{chrome\.cutPrefix\}/)
  assert.match(w, /chrome\.deepest/)
  assert.match(w, /\{chrome\.legend\}/)
  assert.match(w, /title=\{chrome\.closeTitle\}/)
  assert.match(w, /aria-label=\{chrome\.closeTitle\}/)
  assert.match(w, /破線=早送り/)
  assert.match(w, /dashed = rapid/)
  assert.match(w, /蓝浅→红深/)
})

test('FISHING103 F102 PhysicsLab + MATERIALS + F94 demold prefix kept', () => {
  const pl = read('src/components/PhysicsLab.tsx')
  const st = read('src/store.ts')
  const i18n = read('src/i18n.ts')
  assert.match(pl, /環境シミュレーションラボ/)
  assert.match(pl, /Environment simulation lab/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(i18n, /離型到達性|Demold Accessibility|脫模可達性/)
})
