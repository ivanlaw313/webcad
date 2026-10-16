/**
 * FISHING94: JA/EN status sentences prefix 脫模可達性 → catalog tool.accessanalysis
 * (JA 離型到達性 / EN Demold Accessibility). F93 fixed exact label; F94 fixes result sentence.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING94 tStatusOnce has demold status prefix replace before _STATUS_EXACT', () => {
  const i18n = read('src/i18n.ts')
  assert.match(i18n, /FISHING94: status result sentences/)
  assert.match(i18n, /s\.includes\('脫模可達性'\)/)
  const once = i18n.slice(i18n.indexOf('function tStatusOnce'))
  const prefAt = once.indexOf("s.includes('脫模可達性')")
  const exactAt = once.indexOf('const exact = _STATUS_EXACT[s]')
  assert.ok(prefAt >= 0 && exactAt > prefAt)
})

test('FISHING94 runtime status prefix JA 離型到達性 / EN Demold Accessibility', async () => {
  const { tStatus } = await import('../src/i18n.ts')
  const sample = '脫模可達性（方向 [0,0,1]）：12 三角 · 🔴倒扣不可脫 8 · 🟢可脫 4'
  const ja = tStatus(sample, 'ja')
  const en = tStatus(sample, 'en')
  assert.match(ja, /^離型到達性/)
  assert.doesNotMatch(ja, /脫模可達性/)
  assert.match(en, /^Demold Accessibility/)
  assert.doesNotMatch(en, /脫模可達性/)
  assert.equal(tStatus('脫模可達性：需要活動實體', 'ja'), '離型到達性：需要活動實體')
  // F95: exact 已關脫模可達性 → status.demoldClosed (離型到達性を閉じました), not prefix-only
  assert.match(tStatus('已關脫模可達性', 'ja'), /離型/)
  assert.doesNotMatch(tStatus('已關脫模可達性', 'ja'), /脫模可達性/)
  // zh unchanged Formal
  assert.equal(tStatus(sample, 'zh-HK'), sample)
})

test('FISHING94 F93 catalog exact + F92 ja locale + MATERIALS kept', () => {
  const i18n = read('src/i18n.ts')
  const ja = read('src/i18n/locales/ja.ts')
  const st = read('src/store.ts')
  assert.match(i18n, /const catalogKey = LABEL_TO_KEY\[s\]/)
  assert.match(ja, /"cmd\.accessanalysis":\s*"離型到達性"/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
