/**
 * FISHING63: ParamsPanel 匯入設計表 always visible in 進階; tip.* catalog sync vs ribbon.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING63 進階 always mounts 匯入設計表 (not gated by params.length)', () => {
  const pp = read('src/components/ParamsPanel.tsx')
  assert.match(pp, /data-testid="params-import-design-table"/)
  assert.match(pp, /📥 匯入設計表/)
  // import button must not sit only inside params.length > 0 block as sole occurrence
  const idxDetails = pp.indexOf("進階：配置、設計表及匯出")
  const idxImport = pp.indexOf('params-import-design-table')
  assert.ok(idxDetails > 0 && idxImport > idxDetails)
  // between details open and import: no sole gate wrapping import
  const slice = pp.slice(idxDetails, idxImport + 80)
  assert.match(slice, /匯入設計表/)
  assert.doesNotMatch(slice, /params\.length > 0 &&[\s\S]{0,200}params-import-design-table/)
})

test('FISHING63 tip.align still mentions 選面配合; tip.combine syncs ribbon Formal 實體', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  assert.match(hk, /"tip\.align": "對齊：.*選面配合/)
  assert.match(hk, /"tip\.combine":/)
  // ribbon combine tip fragment must appear in catalog
  const m = rb.match(/id: 'combine'[^}]*?tip: '((?:\\'|[^'])*)'/)
  assert.ok(m, 'ribbon combine tip')
  const tip = m[1].replace(/\\'/g, "'")
  // catalog tip.combine should equal ribbon (escaped)
  const hm = hk.match(/"tip\.combine": "((?:\\"|[^"])*)"/)
  assert.ok(hm)
  const cat = hm[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  assert.equal(cat, tip)
})

test('FISHING63 tip.joint 轉動; MATERIALS SC kept', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const st = read('src/store.ts')
  assert.match(hk, /tip\.joint.*轉動\/滑動\/剛性/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
