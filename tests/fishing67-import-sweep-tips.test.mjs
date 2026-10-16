/**
 * FISHING67: tip.sweep/aerolab sync + tip.importdxf/importsvg/insertcomponent/meshfit catalog.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

function firstRibbonTip(rb, id) {
  const m = rb.match(new RegExp("id: '" + id + "'[^}]*?tip: '((?:\\\\'|[^'])*)'", 's'))
  assert.ok(m, 'ribbon ' + id)
  return m[1].replace(/\\'/g, "'")
}

function catalogTip(hk, id) {
  const m = hk.match(new RegExp('"tip\\.' + id + '": "((?:\\\\"|[^"])*)"'))
  assert.ok(m, 'catalog tip.' + id)
  return m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

test('FISHING67 tip.sweep/aerolab match ribbon', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  assert.equal(catalogTip(hk, 'sweep'), firstRibbonTip(rb, 'sweep'))
  assert.equal(catalogTip(hk, 'aerolab'), firstRibbonTip(rb, 'aerolab'))
  assert.match(catalogTip(hk, 'sweep'), /壁厚>0 出空心管/)
})

test('FISHING67 tip.importdxf/importsvg/insertcomponent/meshfit Formal 匯入 in catalog', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  for (const id of ['importdxf', 'importsvg', 'insertcomponent', 'meshfit']) {
    assert.equal(catalogTip(hk, id), firstRibbonTip(rb, id), id)
  }
  assert.match(catalogTip(hk, 'importdxf'), /匯入 2D DXF/)
  assert.match(catalogTip(hk, 'meshfit'), /最近匯入/)
  assert.match(catalogTip(hk, 'insertcomponent'), /當前檔案/)
})

test('FISHING67 tip.align/joint kept; MATERIALS SC; tip.* no Formal SC leftovers', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const st = read('src/store.ts')
  assert.match(hk, /tip\.align.*選面配合/)
  assert.match(hk, /tip\.joint.*轉動\/滑動\/剛性/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  for (const tip of [...hk.matchAll(/"tip\.[^"]+": "((?:\\"|[^"])*)"/g)].map((m) => m[1])) {
    assert.doesNotMatch(tip, /導入|導出|文件|設置|着色|旋轉\/滑動|旋轉／滑動/)
  }
})
