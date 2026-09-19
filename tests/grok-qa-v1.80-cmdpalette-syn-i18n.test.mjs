/**
 * v1.80: migrate CommandPalette SYN synonym table → alias.* catalogs (4 locales);
 * i18n extras labels (act:save/open/undo/…); drop hardcoded SYN.
 * Plus JA SketchToolPanel: sk.dimension / sk.toolTitle.dimension = 寸法 (no EN Dimension shred).
 * Pins: 插入STL网格 · 實驗室 · 尺寸已拒絕 · 日本語 · JA tool.cone 円錐 ·
 *       HelpPanel · file.importStl/history TC · prim JP toasts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  msg, catalogKeyCount, allCatalogKeys, LOCALES, CATALOGS, tStatus, tLabel,
} from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.80; SW CACHE webcad-v1.80', () => {
  assert.match(version, /APP_VERSION = '1\.80'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.80'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.79'/)
})

test('v1.80: catalog parity; ≥109 alias.* + cmd.act* extras', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 820, `expected ≥820 keys, got ${counts[0]}`)
  const keys = allCatalogKeys()
  const aliases = keys.filter((k) => k.startsWith('alias.'))
  assert.ok(aliases.length >= 109, `alias count ${aliases.length}`)
  for (const k of [
    'alias.cone', 'alias.worm', 'alias.gear', 'alias.insertmesh', 'alias.compboolean',
    'alias.boundarypatch', 'alias.exportstl', 'alias.sketch', 'alias.fillet',
    'cmd.actSave', 'cmd.actOpen', 'cmd.actUndo', 'cmd.actRedo', 'cmd.actFit',
    'cmd.actParams', 'cmd.actHelp', 'cmd.fromFile', 'cmd.fromEdit', 'cmd.fromView',
    'cmd.fromManage', 'cmd.fromHelp', 'cmd.fromTemplate', 'cmd.templatePrefix', 'cmd.templateTip', 'sk.dimension',
  ]) {
    assert.ok(keys.includes(k), `missing ${k}`)
    for (const L of LOCALES) {
      assert.ok(k in CATALOGS[L], `${L} missing ${k}`)
    }
  }
})

test('v1.80: CommandPalette has no hardcoded SYN table', () => {
  assert.doesNotMatch(palette, /const SYN:\s*Record/)
  assert.doesNotMatch(palette, /SYN\[/)
  assert.match(palette, /alias\.\$\{id\}/)
  assert.match(palette, /labelKey:\s*'cmd\.actSave'/)
  assert.match(palette, /fromKey:\s*'cmd\.fromFile'/)
  assert.match(palette, /msg\('cmd\.actSave'/)
  assert.match(palette, /useMemo\(buildCommands,\s*\[lang\]\)/)
})

test('v1.80: zh-HK extras Traditional (no SC 保存项目/打开项目/适应窗口)', () => {
  assert.equal(msg('cmd.actSave', 'zh-HK'), '儲存專案 (JSON)')
  assert.equal(msg('cmd.actOpen', 'zh-HK'), '開啟專案 (JSON)')
  assert.match(msg('cmd.actFit', 'zh-HK'), /適應/)
  assert.doesNotMatch(msg('cmd.actSave', 'zh-HK'), /保存项目/)
  assert.doesNotMatch(msg('cmd.actOpen', 'zh-HK'), /打开项目/)
  assert.doesNotMatch(msg('cmd.actFit', 'zh-HK'), /适应窗口/)
  assert.equal(msg('cmd.fromFile', 'zh-HK'), '檔案')
  assert.equal(msg('cmd.fromEdit', 'zh-HK'), '編輯')
  assert.equal(msg('cmd.fromView', 'zh-HK'), '視圖')
  // File pins retained
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('file.new', 'zh-HK'), '新建檔案')
})

test('v1.80: four-locale alias.cone / alias.gear searchable', () => {
  assert.match(msg('alias.cone', 'ja'), /円錐/)
  assert.match(msg('alias.cone', 'zh-HK'), /圓錐|圆锥/)
  assert.match(msg('alias.gear', 'ja'), /歯車|ギア/)
  assert.match(msg('alias.fillet', 'ja'), /フィレット/)
  assert.match(msg('alias.extrude', 'en'), /extrude/i)
  assert.match(msg('alias.shell', 'zh-CN'), /抽壳/)
  assert.match(msg('alias.insertmesh', 'zh-HK'), /stl|STL|網格|网格/i)
})

test('v1.80: JA / EN extras + act labels', () => {
  assert.match(msg('cmd.actSave', 'ja'), /保存|プロジェクト/)
  assert.match(msg('cmd.actHelp', 'ja'), /ヘルプ/)
  assert.equal(msg('cmd.actUndo', 'en'), 'Undo')
  assert.equal(msg('cmd.actRedo', 'en'), 'Redo')
  assert.match(msg('cmd.actFit', 'en'), /Fit|Home/i)
  assert.equal(msg('cmd.actSave', 'zh-CN'), '保存项目 (JSON)')
})


test('v1.80 JA SketchToolPanel: sk.dimension / toolTitle = 寸法 — no EN Dimension shred', () => {
  assert.equal(msg('sk.dimension', 'ja'), '寸法')
  assert.equal(msg('sk.toolTitle.dimension', 'ja'), '寸法')
  assert.equal(msg('sk.dimension', 'zh-HK'), '尺寸')
  assert.equal(msg('sk.dimension', 'zh-CN'), '尺寸')
  assert.equal(msg('sk.dimension', 'en'), 'Dimension')
  assert.equal(tStatus('尺寸', 'ja'), '寸法')
  assert.equal(tStatus('尺寸工具', 'ja'), '寸法')
  assert.equal(tStatus('⟷ 尺寸', 'ja'), '⟷ 寸法')
  assert.doesNotMatch(tStatus('尺寸', 'ja'), /Dimension/)
  assert.doesNotMatch(tStatus('尺寸工具', 'ja'), /Dimension/)
  assert.equal(tLabel('尺寸工具', 'ja'), '寸法')
  assert.equal(tLabel('尺寸', 'ja'), '寸法')
  const panel = readFileSync(new URL('../src/components/SketchToolPanel.tsx', import.meta.url), 'utf8')
  assert.match(panel, /sk\.toolTitle\.dimension|sk\.dimension/)
  assert.match(panel, /msg\('sk\.dimension'/)
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /msg\('sk\.dimension'/)
})

test('v1.80 pins retained', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(msg('tab.LAB', 'zh-HK'), '🧪實驗室')
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('tool.cone', 'ja'), '円錐')
  assert.match(msg('help.title', 'ja'), /ヘルプ|ショートカット/)
})
