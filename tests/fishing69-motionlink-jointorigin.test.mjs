/**
 * FISHING69: Formal 運動連結 + tip.jointorigin long ASSEMBLE tip (F66 recheck).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING69 Formal label 運動連結 not 運動連接 in ribbon/catalog/JointsPanel', () => {
  const rb = read('src/ribbon.ts')
  const hk = read('src/i18n/locales/zh-HK.ts')
  const jp = read('src/components/JointsPanel.tsx')
  assert.match(rb, /label: '運動連結'/)
  assert.match(hk, /"tool\.motionlink": "運動連結"/)
  assert.match(hk, /"cmd\.motionlink": "運動連結"/)
  assert.match(hk, /tip\.motionlink.*運動連結區/)
  assert.match(jp, /運動連結（齒輪比）/)
  assert.doesNotMatch(rb, /運動連接/)
  assert.doesNotMatch(jp, /運動連接/)
})

test('FISHING69 tip.jointorigin = long ASSEMBLE Formal (GM-3DV4)', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  const m = hk.match(/"tip\.jointorigin": "((?:\\"|[^"])*)"/)
  assert.ok(m)
  const tip = m[1].replace(/\\"/g, '"')
  assert.match(tip, /GM-3DV4 A1/)
  assert.match(tip, /可複用命名幀/)
  assert.match(tip, /關節原點/)
  // all ribbon jointorigin tips long
  const tips = [...rb.matchAll(/id: 'jointorigin'[^}]*?tip: '((?:\\'|[^'])*)'/gs)].map((x) => x[1])
  assert.ok(tips.length >= 1)
  for (const t of tips) assert.match(t, /GM-3DV4 A1/)
  assert.equal(tip, tips[0].replace(/\\'/g, "'"))
})

test('FISHING69 MATERIALS SC kept; tip.align/joint Formal kept', () => {
  const st = read('src/store.ts')
  const hk = read('src/i18n/locales/zh-HK.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(hk, /tip\.align.*選面配合/)
  assert.match(hk, /tip\.joint.*轉動\/滑動\/剛性/)
})
