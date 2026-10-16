/**
 * CORE16 residual more21: Ribbon / toolbar group labels Formal Traditional Chinese.
 * Sample Fusion-aligned chrome: SOLID→實體, CREATE→建立, SKETCH wording 草圖 —
 * not Simplified 实体/创建/草图, not colloquial Cantonese.
 * Complements grok-qa-v1.61 ZH_GROUP/TAB without re-testing every residual tab.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const zhHK = readFileSync(new URL('../src/i18n/locales/zh-HK.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

function zhGroupBlock(src) {
  const i = src.indexOf('const ZH_GROUP')
  assert.ok(i >= 0, 'ZH_GROUP missing')
  const j = src.indexOf('const ZH_TAB', i)
  assert.ok(j > i, 'ZH_TAB after ZH_GROUP missing')
  return src.slice(i, j)
}

function zhTabBlock(src) {
  const i = src.indexOf('const ZH_TAB')
  assert.ok(i >= 0, 'ZH_TAB missing')
  const j = src.indexOf('export function tGroup', i)
  assert.ok(j > i, 'tGroup after ZH_TAB missing')
  return src.slice(i, j)
}

test('ZH_TAB Formal sample: SOLID → 實體 (not 实体 / English SOLID alone)', () => {
  const tab = zhTabBlock(i18n)
  assert.match(tab, /SOLID:\s*'實體'/)
  assert.doesNotMatch(tab, /SOLID:\s*'实体'/)
  assert.doesNotMatch(tab, /SOLID:\s*'SOLID'/)
  assert.match(tab, /SURFACE:\s*'曲面'/)
  assert.match(tab, /FORM:\s*'造型'/)
  assert.doesNotMatch(tab, COLLOQ)
})

test('ZH_GROUP Formal sample: CREATE／MODIFY／CONSTRAINTS → 建立／修改／約束', () => {
  const group = zhGroupBlock(i18n)
  assert.match(group, /CREATE:\s*'建立'/)
  assert.match(group, /MODIFY:\s*'修改'/)
  assert.match(group, /CONSTRAINTS:\s*'約束'/)
  assert.match(group, /ASSEMBLE:\s*'裝配'/)
  assert.match(group, /CONSTRUCT:\s*'構造'/)
  assert.match(group, /INSPECT:\s*'檢查'/)
  // Fusion alignment: no Simplified chrome
  assert.doesNotMatch(group, /CREATE:\s*'创建'/)
  assert.doesNotMatch(group, /CONSTRAINTS:\s*'约束'/)
  assert.doesNotMatch(group, /CONSTRUCT:\s*'构造'/)
  assert.doesNotMatch(group, /ASSEMBLE:\s*'装配'/)
  assert.doesNotMatch(group, COLLOQ)
})

test('Ribbon / toolbar 草圖 Formal sample (not 草图; SOLID CREATE sketch pin)', () => {
  assert.match(ribbon, /id:\s*'sketch',\s*label:\s*'建立草圖'/)
  assert.match(ribbon, /TABS|SOLID:\s*\{\s*id:\s*'SOLID'/)
  assert.match(ribbon, /name:\s*'CREATE'/)
  assert.match(ribbon, /name:\s*'MODIFY'/)
  // Sketch chrome / finish
  assert.match(ribbonUi, /完成草圖|ui\.finishSketch|mm\.finishSketch/)
  assert.doesNotMatch(ribbon, /id:\s*'sketch',\s*label:\s*'创建草图'/)
  assert.doesNotMatch(ribbon, /id:\s*'sketch',\s*label:\s*'建立草图'/)
  // Catalog / EN map keeps Formal 草圖 key
  assert.match(i18n, /'草圖':\s*'Sketch'/)
  assert.doesNotMatch(zhHK, /"tab\.SOLID":\s*"实体"/)
  // Prefer zh-HK tab.SOLID if catalogued
  if (/tab\.SOLID/.test(zhHK)) {
    assert.match(zhHK, /"tab\.SOLID":\s*"實體"/)
  }
})

test('tGroup / tTab wired for zh-HK Formal chrome', () => {
  assert.match(i18n, /export function tGroup/)
  assert.match(i18n, /export function tTab/)
  assert.match(i18n, /L === 'zh-HK'\) return ZH_GROUP/)
  assert.match(i18n, /L === 'zh-HK'\) return ZH_TAB/)
  assert.match(ribbonUi, /tGroup\(|tTab\(/)
})
