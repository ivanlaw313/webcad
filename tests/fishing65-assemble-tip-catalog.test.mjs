/**
 * FISHING65: tip.gear sync + Assemble tip.facemate/asbuiltjoint/groundcomp catalog.
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

test('FISHING65 tip.gear matches ribbon (斜齒／分度圓)', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  const tip = catalogTip(hk, 'gear')
  assert.equal(tip, firstRibbonTip(rb, 'gear'))
  assert.match(tip, /斜齒/)
  assert.match(tip, /分度圓/)
})

test('FISHING65 Assemble tip.facemate/asbuiltjoint/groundcomp in catalog = ribbon', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  for (const id of ['facemate', 'asbuiltjoint', 'groundcomp']) {
    assert.equal(catalogTip(hk, id), firstRibbonTip(rb, id), id)
  }
  assert.match(catalogTip(hk, 'facemate'), /選面配合.*面貼合/)
  assert.match(catalogTip(hk, 'asbuiltjoint'), /預設建立轉動關節/)
})

test('FISHING65 tip.align/joint kept; MATERIALS SC; tip.* no Formal SC', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const st = read('src/store.ts')
  assert.match(hk, /tip\.align.*選面配合/)
  assert.match(hk, /tip\.joint.*轉動\/滑動\/剛性/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  for (const tip of [...hk.matchAll(/"tip\.[^"]+": "((?:\\"|[^"])*)"/g)].map((m) => m[1])) {
    assert.doesNotMatch(tip, /導入|導出|文件|設置|着色|旋轉\/滑動|旋轉／滑動/)
  }
})
