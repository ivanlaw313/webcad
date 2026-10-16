/**
 * FISHING83: F82 leftover 關閉脫模可達性 + draft legend 無法開模 (not 開啟模).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING83 access info-card close title 關閉脫模可達性', () => {
  const vp = read('src/components/Viewport.tsx')
  assert.match(vp, /tStatus\('關閉脫模可達性'/)
  assert.doesNotMatch(vp, /tStatus\('關閉可達性分析'/)
  assert.match(vp, /🔓 脫模可達性/)
})

test('FISHING83 draft legend 無法開模 not 開啟模', () => {
  const vp = read('src/components/Viewport.tsx')
  assert.match(vp, /倒扣（無法開模）/)
  assert.doesNotMatch(vp, /undercut/)
  assert.doesNotMatch(vp, /無法開啟模/)
})

test('FISHING83 MATERIALS/DENSITY_PREF SC + F82 脫模可達性 cmd kept', () => {
  const st = read('src/store.ts')
  const hk = read('src/i18n/locales/zh-HK.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(hk, /"cmd\.accessanalysis": "脫模可達性"/)
  assert.match(st, /已關脫模可達性/)
})
