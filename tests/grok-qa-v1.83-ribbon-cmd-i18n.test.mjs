/**
 * v1.83: Ribbon button names via cmd.* four-locale catalog (was hardcoded TC).
 * resolveRibbonCmd / ribbonCmdLabel · variant LABEL_TO_KEY · no EN shred on JA
 * Pins: BD-7301/8001 · BD-8201/8202 · Browser/File TC · JA 寸法/円錐 · mm.* · tip.* · sample.* ·
 *       profile TC · ui.disabled.* · HelpPanel · CommandPalette
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  msg, catalogKeyCount, allCatalogKeys, LOCALES, CATALOGS, tLabel, ribbonCmdLabel,
} from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const ltk = readFileSync(new URL('../src/i18n/labelToKey.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.83; SW CACHE webcad-v1.83', () => {
  assert.match(version, /APP_VERSION = '1\.83'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.83'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.82'/)
})

test('v1.83: catalog parity ≥1200; cmd.sketch/extrude/fillet + variants', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 1200, `expected ≥1200 keys, got ${counts[0]}`)
  const keys = allCatalogKeys()
  const cmds = keys.filter((k) => k.startsWith('cmd.') && !k.startsWith('cmd.act') && !k.startsWith('cmd.from') && !k.startsWith('cmd.search') && !k.startsWith('cmd.empty') && !k.startsWith('cmd.hint') && !k.startsWith('cmd.show') && !k.startsWith('cmd.template') && !k.startsWith('cmd.aria'))
  assert.ok(cmds.length >= 300, `cmd tool keys ${cmds.length}`)
  for (const k of [
    'cmd.sketch', 'cmd.extrude', 'cmd.fillet', 'cmd.cone', 'cmd.hole',
    'cmd.patternRect', 'cmd.thicken', 'cmd.presspull', 'cmd.splitbody',
    'cmd.sheetExtrude', 'cmd.sheetShell', 'cmd.sheetFillet',
    'tip.createform', 'tip.releaseMouse', 'mm.delete', 'sample.gear', 'ui.disabled.skDrag',
    'profile.name.L', 'sk.dimension', 'alias.cone', 'status.meshDropArmed',
  ]) {
    assert.ok(keys.includes(k), `missing ${k}`)
    for (const L of LOCALES) assert.ok(k in CATALOGS[L], `${L} missing ${k}`)
  }
})

test('v1.83: Ribbon uses resolveRibbonCmd / ribbonCmdLabel', () => {
  assert.match(ribbonUi, /resolveRibbonCmd/)
  assert.match(ribbonUi, /ribbonCmdLabel/)
  assert.match(ribbonUi, /resolveRibbonCmd\(t\.id,\s*lang,\s*t\.label\)/)
  // high-vis caption path no longer raw tLabel(t.label) only
  assert.ok((ribbonUi.match(/resolveRibbonCmd\(/g) || []).length >= 8)
})

test('v1.83: cmd.* four-locale — EN/JA one-shot (no TC shred / no EN shred on JA)', () => {
  assert.equal(msg('cmd.sketch', 'zh-HK'), '建立草圖')
  assert.match(msg('cmd.sketch', 'en'), /Sketch/i)
  assert.match(msg('cmd.sketch', 'ja'), /スケッチ/)
  assert.doesNotMatch(msg('cmd.sketch', 'ja'), /建立草圖|Create Sketch/)

  assert.equal(msg('cmd.extrude', 'zh-HK'), '拉伸')
  assert.equal(msg('cmd.extrude', 'en'), 'Extrude')
  assert.match(msg('cmd.extrude', 'ja'), /押し出し|押出/)
  assert.notEqual(msg('cmd.extrude', 'ja'), msg('cmd.extrude', 'en'))

  assert.equal(msg('cmd.fillet', 'zh-HK'), '圓角')
  assert.match(msg('cmd.fillet', 'ja'), /フィレット/)
  assert.equal(msg('cmd.cone', 'ja'), '円錐')

  assert.equal(msg('cmd.hole', 'zh-HK'), '孔')
  assert.equal(msg('cmd.patternRect', 'zh-HK'), '矩形陣列')
  assert.match(msg('cmd.patternRect', 'ja'), /矩形|パターン/)
  assert.doesNotMatch(msg('cmd.patternRect', 'ja'), /矩形陣列/)
})

test('v1.83: ribbonCmdLabel resolves id + variant labels', () => {
  assert.equal(ribbonCmdLabel('sketch', 'zh-HK', '建立草圖'), '建立草圖')
  assert.match(ribbonCmdLabel('sketch', 'en', '建立草圖'), /Sketch/i)
  assert.match(ribbonCmdLabel('sketch', 'ja', '建立草圖'), /スケッチ/)
  assert.equal(ribbonCmdLabel('hole', 'zh-HK', '孔'), '孔')
  assert.match(ribbonCmdLabel('hole', 'ja', '孔'), /穴/)
  assert.equal(ribbonCmdLabel('pattern', 'zh-HK', '矩形陣列'), '矩形陣列')
  assert.match(ribbonCmdLabel('pattern', 'en', '矩形陣列'), /Rectangular|Pattern/i)
  assert.match(ribbonCmdLabel('pattern', 'ja', '矩形陣列'), /矩形|パターン/)
  // short EN tokens must not leak into JA for high-vis
  assert.doesNotMatch(ribbonCmdLabel('extrude', 'ja', '拉伸'), /\bExtrude\b/)
  assert.doesNotMatch(ribbonCmdLabel('fillet', 'ja', '圓角'), /\bFillet\b/)
})

test('v1.83: LABEL_TO_KEY covers prior unmapped ribbon variants', () => {
  for (const lab of ['孔', '矩形陣列', '加厚', '按拉', '分割實體', '齒輪', '折彎圓角']) {
    assert.match(ltk, new RegExp(`'${lab}':\\s*'cmd\\.`))
  }
})

test('v1.83: ribbon tip residual SC 辐條 cleared', () => {
  assert.equal(ribbonSrc.split('辐條').length - 1, 0)
  assert.match(ribbonSrc, /輻條/)
})

test('v1.83 BD-8202: exact 放開滑鼠 in drop + disabled (not only 放開以匯入)', () => {
  assert.match(msg('status.meshDropArmed', 'zh-HK'), /放開滑鼠/)
  assert.equal(msg('tip.releaseMouse', 'zh-HK'), '放開滑鼠')
  assert.match(msg('ui.disabled.skDrag', 'zh-HK'), /放開滑鼠/)
  assert.doesNotMatch(msg('status.meshDropArmed', 'zh-HK'), /松开|导入网格|放开鼠标/)
  assert.doesNotMatch(msg('ui.disabled.skDrag', 'zh-HK'), /放开|鼠标/)
  const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
  assert.match(meshDrop, /放開滑鼠以匯入網格/)
})

test('v1.83 BD-8201: profile L角鐵／U槽鋼 pure TC; EN/JA separate', () => {
  assert.equal(msg('profile.name.L', 'zh-HK'), 'L角鐵')
  assert.equal(msg('profile.name.U', 'zh-HK'), 'U槽鋼')
  assert.equal(msg('profile.name.T', 'zh-HK'), 'T型材')
  assert.doesNotMatch(msg('profile.name.L', 'zh-HK'), /角铁/)
  assert.doesNotMatch(msg('profile.name.U', 'zh-HK'), /槽钢/)
  assert.equal(msg('profile.name.L', 'zh-CN'), 'L角铁')
  assert.equal(msg('profile.name.U', 'zh-CN'), 'U槽钢')
  assert.match(msg('profile.name.L', 'en'), /L-angle|Angle/i)
  assert.match(msg('profile.name.U', 'en'), /U-channel|Channel/i)
  assert.match(msg('profile.name.U', 'ja'), /チャンネル|チャネル/)
  assert.notEqual(msg('profile.name.L', 'ja'), msg('profile.name.L', 'en'))
  const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(viewport, /profileSectionName\('L'/)
  assert.match(viewport, /profileSectionName\('U'/)
  assert.equal(viewport.split("tStatus('L 角铁'").length - 1, 0)
  assert.equal(viewport.split("tStatus('U 槽钢'").length - 1, 0)
})

test('v1.83 pins: BD-8001 TC · JA 寸法/円錐 · sample/tip · ui.disabled · profile', () => {
  assert.match(msg('status.meshDropArmed', 'zh-HK'), /放開滑鼠以匯入網格/)
  assert.doesNotMatch(msg('status.meshDropArmed', 'zh-HK'), /松开|导入网格/)
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('sk.dimension', 'ja'), '寸法')
  assert.equal(msg('tool.cone', 'ja'), '円錐')
  assert.equal(msg('cmd.cone', 'ja'), '円錐')
  assert.match(msg('sample.gear', 'ja'), /歯車/)
  assert.match(msg('ui.disabled.skDrag', 'zh-HK'), /放開滑鼠/)
  assert.doesNotMatch(msg('ui.disabled.skDrag', 'zh-HK'), /放开|鼠标/)
  assert.equal(msg('profile.name.L', 'zh-HK'), 'L角鐵')
  assert.equal(tLabel('圓角', 'ja').length > 0, true)
})
