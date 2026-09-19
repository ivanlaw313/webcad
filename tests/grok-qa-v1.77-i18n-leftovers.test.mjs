/**
 * v1.77: clear residual i18n leftovers after v1.76.
 * Ribbon tip SC→TC · Drawing/Inspect/dialogs/Viewport/Ribbon chrome → catalog.
 * Pins: 插入STL网格 · 實驗室 · 尺寸已拒絕 · Ribbon 日本語 · JA tool.* · HelpPanel catalog.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  msg, catalogKeyCount, allCatalogKeys, LOCALES, CATALOGS, tLabel,
} from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const inspect = readFileSync(new URL('../src/components/InspectorPanel.tsx', import.meta.url), 'utf8')
const narrow = readFileSync(new URL('../src/components/NarrowHint.tsx', import.meta.url), 'utf8')
const insert = readFileSync(new URL('../src/components/InsertDialog.tsx', import.meta.url), 'utf8')
const prompt = readFileSync(new URL('../src/components/PromptDialog.tsx', import.meta.url), 'utf8')
const cmdDlg = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.77; SW CACHE webcad-v1.77', () => {
  assert.match(version, /APP_VERSION = '1\.77'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.77'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.76'/)
})

test('v1.77: catalog parity ≥580 keys; new draw/insp/dlg/hint/vp/ui keys', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 580, `expected ≥580 keys, got ${counts[0]}`)
  const keys = allCatalogKeys()
  for (const k of [
    'draw.view.front', 'draw.overflow', 'insp.properties', 'hint.title',
    'dlg.ok', 'insert.confirm', 'vp.opJoin', 'ui.load', 'fastener.title',
  ]) {
    assert.ok(keys.includes(k), `missing ${k}`)
  }
  assert.equal(msg('ui.load', 'en'), 'Load')
  assert.match(msg('draw.view.front', 'ja'), /正面|前/)
  assert.equal(msg('tool.arrange', 'en'), 'Arrange') // EN CJK fix
})

test('v1.77: Ribbon chrome + fastener dialog use msg()', () => {
  assert.match(ribbon, /msg\('ui\.load', lang\)/)
  assert.match(ribbon, /msg\('ui\.materialEllipsis', lang\)/)
  assert.match(ribbon, /msg\('ui\.color', lang\)/)
  assert.match(ribbon, /msg\('fastener\.title', lang\)/)
  assert.doesNotMatch(ribbon, /en \? 'Load'/)
  assert.doesNotMatch(ribbon, /en \? 'Material/)
})

test('v1.77: Drawing / Inspect / NarrowHint / Insert / Prompt / CommandDialog / Viewport', () => {
  assert.match(drawing, /msg\('draw\.overflow', lang\)/)
  assert.match(drawing, /viewLabel\(/)
  assert.match(inspect, /msg\('insp\.properties', lang\)/)
  assert.match(narrow, /msg\('hint\.title', lang\)/)
  assert.match(insert, /msg\('insert\.confirm', lang\)/)
  assert.match(prompt, /msg\('dlg\.ok', lang\)/)
  assert.match(cmdDlg, /msg\('dlg\.resetPanelPos', lang\)/)
  assert.match(viewport, /msg\('vp\.opJoin', lang\)/)
  assert.match(viewport, /msg\('vp\.formUndo', lang\)/)
  assert.doesNotMatch(narrow, /en \? 'Small-screen/)
})

test('v1.77: ribbon tips no residual SC markers (这/说/点击/实体…)', () => {
  const tips = [...ribbonSrc.matchAll(/tip:\s*'((?:\\'|[^'])*)'/g)].map((m) => m[1])
  assert.ok(tips.length > 200, `expected many tips, got ${tips.length}`)
  const bad = tips.filter((t) => /[这说]|点击|实体|草图|选择|设置|旋转|阵列|镜像|导出|导入|推荐|也可将/.test(t))
  assert.equal(bad.length, 0, `SC tip leftovers: ${bad.slice(0, 5).join(' | ')}`)
})

test('Pins + BOT-D 7302 false-positive: tree/timeline TC labels present', () => {
  assert.match(ribbonSrc, /id: 'insertmesh', label: '插入STL网格'/)
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.match(ribbonSrc, /'🧪實驗室'/)
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.match(ribbon, /日本語/)
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')
  assert.notEqual(msg('tool.fillet', 'ja'), msg('tool.fillet', 'en'))
  // HelpPanel catalog stays (v1.76)
  assert.ok(allCatalogKeys().includes('help.title'))
  // BUG-BD-7302: labels already Traditional in tree/timeline
  assert.match(tree, /label: '複製實體'/)
  assert.match(tree, /label: 'STEP實體'/)
  assert.match(tree, /label: '網格實體'/)
  assert.match(tree, /label: '合併面'/)
  assert.match(timeline, /label: '複製實體'/)
  assert.match(timeline, /label: '合併面'/)
})
