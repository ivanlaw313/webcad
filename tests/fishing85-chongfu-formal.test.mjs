/**
 * FISHING85: Formal 重復→重複 on user statuses; demold EN; draft legend no English undercut.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING85 store texture/mesh Formal 重複 not 重復', () => {
  const st = read('src/store.ts')
  assert.match(st, /改重複密度，無 UV 縫/)
  assert.match(st, /共用重複密度/)
  assert.match(st, /焊接 \$\{fixed\} 重複頂點/)
  assert.match(st, /重複三角/)
  assert.match(st, /再畫一張，重複\$\{skippedArb/)
  assert.doesNotMatch(st, /重復密度/)
  assert.doesNotMatch(st, /重復頂點/)
  assert.doesNotMatch(st, /重復三角/)
})

test('FISHING85 i18n keys 重複密度 + 脫模可達性 Demold EN', () => {
  const i18n = read('src/i18n.ts')
  assert.match(i18n, /改重複密度，無 UV 縫/)
  assert.match(i18n, /'脫模可達性': 'Demold Accessibility'/)
  assert.doesNotMatch(i18n, /Draft accessibility/)
})

test('FISHING85 draft legend 倒扣（無法開模）; MATERIALS SC kept', () => {
  const vp = read('src/components/Viewport.tsx')
  const st = read('src/store.ts')
  assert.match(vp, /倒扣（無法開模）/)
  assert.doesNotMatch(vp, /undercut/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
