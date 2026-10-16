/**
 * FISHING95: close/closed demold status via catalog (JA 離型… not EN-only _STATUS_EXACT).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING95 locales status.closeDemold / demoldClosed present', () => {
  for (const [f, close, closed] of [
    ['src/i18n/locales/ja.ts', '離型到達性を閉じる', '離型到達性を閉じました'],
    ['src/i18n/locales/en.ts', 'Close demold accessibility', 'Demold accessibility closed'],
    ['src/i18n/locales/zh-HK.ts', '關閉脫模可達性', '已關脫模可達性'],
    ['src/i18n/locales/zh-CN.ts', '关闭脱模可达性', '已关脱模可达性'],
  ]) {
    const t = read(f)
    assert.match(t, new RegExp(`"status\\.closeDemold":\\s*"${close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
    assert.match(t, new RegExp(`"status\\.demoldClosed":\\s*"${closed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`))
  }
})

test('FISHING95 LABEL_TO_KEY close/closed → status.*', () => {
  const k = read('src/i18n/labelToKey.ts')
  assert.match(k, /'關閉脫模可達性':\s*'status\.closeDemold'/)
  assert.match(k, /'关闭脱模可达性':\s*'status\.closeDemold'/)
  assert.match(k, /'已關脫模可達性':\s*'status\.demoldClosed'/)
  assert.match(k, /'已关脱模可达性':\s*'status\.demoldClosed'/)
})

test('FISHING95 runtime tStatus close demold JA/EN/zh-HK', async () => {
  const { tStatus } = await import('../src/i18n.ts')
  const jaClose = tStatus('關閉脫模可達性', 'ja')
  assert.match(jaClose, /離型/)
  assert.doesNotMatch(jaClose, /^Close demold/i)
  assert.equal(tStatus('關閉脫模可達性', 'en'), 'Close demold accessibility')
  assert.equal(tStatus('關閉脫模可達性', 'zh-HK'), '關閉脫模可達性')
  const jaClosed = tStatus('已關脫模可達性', 'ja')
  assert.match(jaClosed, /離型/)
  assert.equal(tStatus('已關脫模可達性', 'en'), 'Demold accessibility closed')
})
