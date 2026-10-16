/**
 * FISHING68: tip.insertmesh/thickenquilt/finish3d/sk_project + surface tips catalog.
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

const IDS = ['insertmesh', 'thickenquilt', 'finish3d', 'sk_project', 'surfextrude', 'surfsweep', 'surfrevolve']

test('FISHING68 surface/import tip.* catalog matches ribbon', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  for (const id of IDS) {
    assert.equal(catalogTip(hk, id), firstRibbonTip(rb, id), id)
  }
  assert.match(catalogTip(hk, 'insertmesh'), /匯入/)
  assert.match(catalogTip(hk, 'finish3d'), /匯出/)
  assert.match(catalogTip(hk, 'thickenquilt'), /加厚成實體/)
})

test('FISHING68 tip.align/importdxf/joint kept; MATERIALS SC', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const st = read('src/store.ts')
  assert.match(hk, /tip\.align.*選面配合/)
  assert.match(hk, /tip\.importdxf.*匯入 2D DXF/)
  assert.match(hk, /tip\.joint.*轉動\/滑動\/剛性/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})

test('FISHING68 tip.* catalog no Formal SC 導入／導出／文件／設置', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  for (const tip of [...hk.matchAll(/"tip\.[^"]+": "((?:\\"|[^"])*)"/g)].map((m) => m[1])) {
    assert.doesNotMatch(tip, /導入|導出|文件|設置|着色|旋轉\/滑動|旋轉／滑動/)
  }
})
