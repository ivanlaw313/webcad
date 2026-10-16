/**
 * FISHING66: Assemble tip.* catalog fill + SOLID tip sync + joint pick 轉動／滑動關節.
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

const ASSEMBLE = ['newcomp', 'compboolean', 'jointorigin', 'rigidgroup', 'motionlink', 'enablecontact', 'drivejoints']
const SOLID = ['box', 'move', 'emboss', 'fillet', 'pipe', 'draft', 'pathpattern']

test('FISHING66 Assemble tip.* catalog matches ribbon', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  for (const id of ASSEMBLE) {
    assert.equal(catalogTip(hk, id), firstRibbonTip(rb, id), id)
  }
  assert.match(catalogTip(hk, 'motionlink'), /轉動／滑動關節/)
})

test('FISHING66 SOLID tip.box/move/emboss/fillet/pipe/draft/pathpattern = ribbon', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  for (const id of SOLID) {
    assert.equal(catalogTip(hk, id), firstRibbonTip(rb, id), id)
  }
  assert.match(catalogTip(hk, 'box'), /旁邊 ▾/)
})

test('FISHING66 startJointPick status has contiguous 轉動／滑動關節; MATERIALS SC', () => {
  const st = read('src/store.ts')
  const hk = read('src/i18n/locales/zh-HK.ts')
  assert.match(st, /圓柱＝轉動／滑動關節／圓柱/)
  assert.doesNotMatch(st, /圓柱＝轉動／滑動／圓柱 ·/)
  assert.match(hk, /tip\.align.*選面配合/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
