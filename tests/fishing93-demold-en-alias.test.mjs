/**
 * FISHING93: EN alias.accessanalysis prepend Demold Accessibility +
 * JA BrowserTree tStatus('脫模可達性') → 離型到達性 (not EN Demold Accessibility).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING93 en alias.accessanalysis includes Demold Accessibility', () => {
  const en = read('src/i18n/locales/en.ts')
  assert.match(en, /"alias\.accessanalysis":\s*"Demold Accessibility\b/)
  assert.match(en, /"cmd\.accessanalysis":\s*"Demold Accessibility"/)
  assert.match(en, /"tool\.accessanalysis":\s*"Demold Accessibility"/)
})

test('FISHING93 tStatusOnce uses LABEL_TO_KEY before EN _STATUS_EXACT (JA tree demold)', () => {
  const i18n = read('src/i18n.ts')
  assert.match(i18n, /FISHING93: BrowserTree analysis row/)
  assert.match(i18n, /const catalogKey = LABEL_TO_KEY\[s\]/)
  assert.match(i18n, /if \(catalogKey\) return msg\(catalogKey, L\)/)
  // EN exact map may still list 脫模可達性 — catalog must win first
  const once = i18n.slice(i18n.indexOf('function tStatusOnce'))
  const catAt = once.indexOf('const catalogKey = LABEL_TO_KEY[s]')
  const exactAt = once.indexOf('const exact = _STATUS_EXACT[s]')
  assert.ok(catAt >= 0 && exactAt > catAt, 'catalog before exact')
})

test('FISHING93 runtime tStatus 脫模可達性 → JA 離型到達性 / EN Demold Accessibility', async () => {
  const { tStatus } = await import('../src/i18n.ts')
  assert.equal(tStatus('脫模可達性', 'ja'), '離型到達性')
  assert.equal(tStatus('脫模可達性', 'en'), 'Demold Accessibility')
  assert.equal(tStatus('脱模可达性', 'ja'), '離型到達性')
  // zh keeps Formal SC/TC
  assert.equal(tStatus('脫模可達性', 'zh-HK'), '脫模可達性')
  assert.equal(tStatus('脫模可達性', 'zh-CN'), '脱模可达性')
})
