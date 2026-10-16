/**
 * FISHING93: en locale alias.accessanalysis prepend Demold Accessibility
 * (mirror F92 JA alias; cmd/tool already Demold Accessibility).
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
  assert.match(en, /"alias\.accessanalysis":\s*"[^"]*Demold Accessibility[^"]*"/)
})

test('FISHING93 en cmd/tool.accessanalysis stay Demold Accessibility', () => {
  const en = read('src/i18n/locales/en.ts')
  assert.match(en, /"cmd\.accessanalysis":\s*"Demold Accessibility"/)
  assert.match(en, /"tool\.accessanalysis":\s*"Demold Accessibility"/)
})

test('FISHING93 F92 JA locale + F91 jaLabels + MATERIALS kept', () => {
  const ja = read('src/i18n/locales/ja.ts')
  const labels = read('src/i18n/jaLabels.ts')
  const st = read('src/store.ts')
  assert.match(ja, /"cmd\.accessanalysis":\s*"離型到達性"/)
  assert.match(labels, /"可达性分析":\s*"離型到達性"/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
