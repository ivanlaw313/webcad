/**
 * v1.76: HelpPanel / CommandPalette / File-menu → 4-locale catalog.
 * Pins: 插入STL网格 · 實驗室 · 尺寸已拒絕 · Ribbon 日本語 · JA tool.* stay non-EN.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  msg, catalogKeyCount, allCatalogKeys, LOCALES, CATALOGS, tLabel,
} from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const help = readFileSync(new URL('../src/components/HelpPanel.tsx', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.76; SW CACHE webcad-v1.76', () => {
  assert.match(version, /APP_VERSION = '1\.76'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.76'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.75'/)
})

test('v1.76: catalog has help.*/cmd.*/alias.*/tip.*/file.* and equal counts', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 480, `expected ≥480 keys, got ${counts[0]}`)
  const keys = allCatalogKeys()
  for (const k of ['help.title', 'help.p0', 'cmd.searchPlaceholder', 'alias.fillet', 'tip.sketch', 'file.exportAsmStl', 'file.untitled']) {
    assert.ok(keys.includes(k), `missing ${k}`)
  }
  assert.equal(msg('help.title', 'en'), '❓ Help / Shortcuts')
  assert.match(msg('help.title', 'ja'), /ヘルプ|ショートカット|帮助|Help/)
  assert.equal(msg('cmd.ariaSearch', 'en'), 'Search commands')
  assert.match(msg('alias.sketch', 'ja'), /スケッチ/)
  assert.match(msg('tip.fillet', 'ja'), /フィレット|アール/)
})

test('v1.76: HelpPanel wires msg(help.*) — no hardcoded TC novels', () => {
  assert.match(help, /msg\('help\.title', lang\)/)
  assert.match(help, /HELP_BLOCKS/)
  assert.match(help, /msg\(b\.h, lang\)/)
  assert.match(help, /msg\('help\.gotIt', lang\)/)
  assert.doesNotMatch(help, /最快上手：载入模板/)
  assert.doesNotMatch(help, /使用帮助 \/ 快捷键/)
})

test('v1.76: CommandPalette chrome + tip/alias locale-aware', () => {
  assert.match(palette, /msg\('cmd\.searchPlaceholder', lang\)/)
  assert.match(palette, /msg\('cmd\.showUnavailable', lang\)/)
  assert.match(palette, /resolveTip\(/)
  assert.match(palette, /resolveAlias\(/)
  assert.match(palette, /tLabel\(c\.label, lang\)/)
  assert.doesNotMatch(palette, /aria-label="搜索命令"/)
})

test('v1.76: File menu residual en? ternaries → msg(file.*)', () => {
  assert.match(ribbon, /msg\('file\.importStl', lang\)/)
  assert.match(ribbon, /msg\('file\.exportAsmStlUnion', lang\)/)
  assert.match(ribbon, /msg\('file\.untitled', lang\)/)
  assert.match(ribbon, /msg\('file\.title', lang\)/)
  assert.doesNotMatch(ribbon, /en \? 'Import STL/)
  assert.doesNotMatch(ribbon, /en \? 'Export Assembly STL/)
  assert.doesNotMatch(ribbon, /en \? 'Untitled'/)
})

test('Pins: 插入STL网格 · 實驗室 · 尺寸已拒絕 · 日本語 · JA tool non-EN', () => {
  assert.match(ribbonSrc, /id: 'insertmesh', label: '插入STL网格'/)
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.match(ribbonSrc, /'🧪實驗室'/)
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.match(ribbon, /日本語/)
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')
  assert.notEqual(msg('tool.fillet', 'ja'), msg('tool.fillet', 'en'))
  assert.equal(tLabel('拉伸', 'ja'), '押し出し')
})
