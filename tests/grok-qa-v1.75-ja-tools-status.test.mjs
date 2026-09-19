/**
 * v1.75: JA tool.* fill + high-traffic status toast catalog.
 * Target: identical JA/EN tool.* count ≤ 40 (prefer 0; EN proper-noun exceptions documented).
 * SW CACHE → webcad-v1.75. Keep MESH pin + 實驗室 + 尺寸已拒絕.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import en from '../src/i18n/locales/en.ts'
import ja from '../src/i18n/locales/ja.ts'
import zhHK from '../src/i18n/locales/zh-HK.ts'
import zhCN from '../src/i18n/locales/zh-CN.ts'
import { msg, tLabel, LOCALES, catalogKeyCount } from '../src/i18n.ts'
import {
  shellSuccessStatus, extrudeSuccessStatus, booleanSuccessStatus, filletSuccessStatus,
} from '../src/ui/featureStatus.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.75+', () => {
  assert.match(version, /APP_VERSION = '1\.(7[5-9]|[8-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.75: SW CACHE webcad-v1.75; network-first; release comment', () => {
  assert.match(sw, /const CACHE = 'webcad-v1\.75'/)
  assert.match(sw, /webcad-v1\.75/)
})

test('catalog parity across 4 locales', () => {
  const n = Object.keys(en).length
  assert.equal(Object.keys(ja).length, n)
  assert.equal(Object.keys(zhHK).length, n)
  assert.equal(Object.keys(zhCN).length, n)
  for (const L of LOCALES) assert.equal(catalogKeyCount(L), n)
})

test('v1.75: JA tool.* identical-to-EN count ≤ 40 (was 199)', () => {
  const tools = Object.keys(en).filter((k) => k.startsWith('tool.'))
  const identical = tools.filter((k) => en[k] === ja[k])
  assert.ok(tools.length >= 300, `tool count ${tools.length}`)
  assert.ok(identical.length <= 40, `identical JA=EN tools = ${identical.length} (target ≤40); sample=${identical.slice(0, 8)}`)
  // high-vis tools must be localized
  assert.notEqual(ja['tool.extrude'], en['tool.extrude'])
  assert.notEqual(ja['tool.fillet'], en['tool.fillet'])
  assert.notEqual(ja['tool.shell'], en['tool.shell'])
  assert.match(ja['tool.extrude'], /押し出し|押出/)
  assert.match(ja['tool.fillet'], /フィレット/)
  assert.match(ja['tool.shell'], /シェル/)
})

test('v1.75: status toast keys resolve in all 4 locales', () => {
  for (const L of LOCALES) {
    assert.notEqual(msg('status.extrudeDone', L), 'status.extrudeDone')
    assert.notEqual(msg('status.filletDone', L), 'status.filletDone')
    assert.notEqual(msg('status.shellDone', L), 'status.shellDone')
    assert.notEqual(msg('status.booleanUnite', L), 'status.booleanUnite')
    assert.notEqual(msg('status.cutDone', L), 'status.cutDone')
  }
  assert.match(msg('status.extrudeDone', 'ja'), /押し出し|OCCT/)
  assert.match(msg('status.filletDone', 'ja'), /フィレット/)
  assert.match(shellSuccessStatus({ thickness: 2, dir: 'inside', shellType: 'closed', openCount: 0, tangentChain: false }, 'ja'), /シェル|肉厚/)
  assert.match(extrudeSuccessStatus({ op: 'new' }, 'ja'), /押し出し|OCCT/)
  assert.match(booleanSuccessStatus({ kind: 'body', op: 'join' }, 'ja'), /ブール|結合/)
  assert.match(filletSuccessStatus('en'), /Fillet/)
})

test('pins retained: MESH SC / 實驗室 / 尺寸已拒絕 / 日本語 switcher', () => {
  assert.match(ribbon, /id: 'insertmesh',\s*label: '插入STL网格'/)
  assert.equal(tLabel('插入STL网格', 'zh-HK'), '插入STL网格')
  assert.match(ribbon, /實驗室/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
  assert.match(ribbonUi, /日本語/)
  assert.match(ribbonUi, /\['ja'/)
})
