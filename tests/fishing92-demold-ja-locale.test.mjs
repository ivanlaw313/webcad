/**
 * FISHING92: ja locale Formal leftover — cmd/tool.accessanalysis → 離型到達性
 * (alias keeps アクセス解析 for search; trail F91 jaLabels).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING92 ja locale cmd/tool.accessanalysis === 離型到達性', () => {
  const ja = read('src/i18n/locales/ja.ts')
  assert.match(ja, /"cmd\.accessanalysis":\s*"離型到達性"/)
  assert.match(ja, /"tool\.accessanalysis":\s*"離型到達性"/)
  assert.doesNotMatch(ja, /"cmd\.accessanalysis":\s*"アクセス解析"/)
  assert.doesNotMatch(ja, /"tool\.accessanalysis":\s*"アクセス解析"/)
})

test('FISHING92 ja locale alias.accessanalysis includes 離型到達性', () => {
  const ja = read('src/i18n/locales/ja.ts')
  assert.match(ja, /"alias\.accessanalysis":\s*"[^"]*離型到達性[^"]*"/)
  assert.match(ja, /"alias\.accessanalysis":\s*"[^"]*アクセス解析[^"]*"/)
})

test('FISHING92 F91 jaLabels + F90 zhCN + MATERIALS kept', () => {
  const labels = read('src/i18n/jaLabels.ts')
  const zh = read('src/i18n/zhCNLabels.ts')
  const st = read('src/store.ts')
  assert.match(labels, /"可达性分析":\s*"離型到達性"/)
  assert.match(zh, /"可达性分析":\s*"脱模可达性"/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
