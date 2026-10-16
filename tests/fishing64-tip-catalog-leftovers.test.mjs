/**
 * FISHING64: remaining tip.pattern/presspull/shell catalog sync vs ribbon.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

function firstRibbonTip(rb, id) {
  const re = new RegExp("id: '" + id + "'[^}]*?tip: '((?:\\\\'|[^'])*)'", 's')
  const m = rb.match(re)
  assert.ok(m, 'ribbon tip ' + id)
  return m[1].replace(/\\'/g, "'")
}

function catalogTip(hk, id) {
  const re = new RegExp('"tip\\.' + id + '": "((?:\\\\"|[^"])*)"')
  const m = hk.match(re)
  assert.ok(m, 'catalog tip.' + id)
  return m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\')
}

test('FISHING64 tip.pattern/presspull/shell match ribbon primary tips', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  for (const id of ['pattern', 'presspull', 'shell']) {
    assert.equal(catalogTip(hk, id), firstRibbonTip(rb, id), id)
  }
})

test('FISHING64 tip.align 選面配合 + tip.joint 轉動 kept; MATERIALS SC', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const st = read('src/store.ts')
  assert.match(hk, /tip\.align.*選面配合/)
  assert.match(hk, /tip\.joint.*轉動\/滑動\/剛性/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})

test('FISHING64 tip.* catalog has no Formal SC 導入／導出／文件／設置', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const tips = [...hk.matchAll(/"tip\.[^"]+": "((?:\\"|[^"])*)"/g)].map((m) => m[1])
  for (const tip of tips) {
    assert.doesNotMatch(tip, /導入|導出|文件|設置|着色|旋轉\/滑動|旋轉／滑動/)
  }
})
