/**
 * v1.81: continue clearing four-locale i18n leftovers after v1.80.
 * MarkingMenu tLabel · sample.* templates · Ribbon tip.<id> · gear/worm/profile toasts
 * BD-8001: 主視圖 / 放開 / 單擊 (no SC 主视图/松开/单击 in zh-HK UI).
 * Pins: Browser TC · File TC · JA 寸法/円錐 · prim JP toasts · HelpPanel · CommandPalette aliases · BD-7301
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  msg, catalogKeyCount, allCatalogKeys, LOCALES, CATALOGS, tStatus, tLabel,
} from '../src/i18n.ts'
import {
  gearSuccessStatus, wormSuccessStatus, profileSuccessStatus,
  boxSuccessStatus, coneSuccessStatus,
} from '../src/ui/featureStatus.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const mm = readFileSync(new URL('../src/components/MarkingMenu.tsx', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.81; SW CACHE webcad-v1.81', () => {
  assert.match(version, /APP_VERSION = '1\.81'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.81'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.80'/)
})

test('v1.81: catalog parity ≥900; sample.* ≥34 + tip.* ≥25 + mm.*', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 900, `expected ≥900 keys, got ${counts[0]}`)
  const keys = allCatalogKeys()
  const samples = keys.filter((k) => k.startsWith('sample.'))
  const tips = keys.filter((k) => k.startsWith('tip.'))
  const mms = keys.filter((k) => k.startsWith('mm.'))
  assert.ok(samples.length >= 34, `sample count ${samples.length}`)
  assert.ok(tips.length >= 25, `tip count ${tips.length}`)
  assert.ok(mms.length >= 20, `mm count ${mms.length}`)
  for (const k of [
    'sample.gear', 'sample.gearpair', 'sample.plate', 'sample.honeycomb',
    'mm.dimD', 'mm.fit', 'mm.iso', 'mm.drawSketch', 'mm.unavailable',
    'tip.box', 'tip.gear', 'tip.worm', 'tip.fillet', 'tip.extrude',
    'status.gearCreated', 'status.wormCreated', 'status.profileCreated',
    'ui.busyCancelSketch', 'sk.dimension', 'alias.cone', 'cmd.actSave',
  ]) {
    assert.ok(keys.includes(k), `missing ${k}`)
    for (const L of LOCALES) assert.ok(k in CATALOGS[L], `${L} missing ${k}`)
  }
})

test('v1.81: MarkingMenu applies tLabel; Viewport uses mm.* / TC', () => {
  assert.match(mm, /tLabel\(/)
  assert.match(mm, /msg\('mm\.unavailable'/)
  assert.match(mm, /lab\(it\.label\)/)
  assert.match(viewport, /msg\('mm\.dimD'/)
  assert.match(viewport, /msg\('mm\.fit'/)
  assert.match(viewport, /msg\('mm\.iso'/)
  assert.match(viewport, /msg\('mm\.drawSketch'/)
  // no raw SC construction/fit leftovers in MM label literals
  assert.equal(viewport.split("label: '构造/实线").length - 1, 0)
  assert.equal(viewport.split("label: '适应窗口'").length - 1, 0)
  assert.equal(viewport.split("label: '等轴测'").length - 1, 0)
})

test('v1.81: CommandPalette sample.* + Ribbon tip/sample', () => {
  assert.match(palette, /msg\('sample\.' \+ k/)
  assert.doesNotMatch(palette, /SAMPLE_LABELS\[k\]/)
  assert.match(ribbon, /resolveRibbonTip/)
  assert.match(ribbon, /msg\('sample\.' \+ k/)
  assert.match(ribbon, /msg\('ui\.busyCancelSketch'/)
})

test('v1.81: sample.* four-locale (TC gear / JA 歯車 / EN Involute)', () => {
  assert.equal(msg('sample.gear', 'zh-HK'), '漸開線齒輪')
  assert.equal(msg('sample.gear', 'zh-CN'), '渐开线齿轮')
  assert.match(msg('sample.gear', 'en'), /Involute|gear/i)
  assert.match(msg('sample.gear', 'ja'), /歯車|インボリュート/)
  assert.match(msg('sample.gearpair', 'ja'), /歯車/)
  assert.doesNotMatch(msg('sample.gear', 'zh-HK'), /渐开线/)
  assert.equal(msg('mm.dimD', 'ja'), '寸法 (D)')
  assert.equal(msg('mm.dimD', 'en'), 'Dimension (D)')
  assert.equal(msg('sk.dimension', 'ja'), '寸法')
})

test('v1.81: gear/worm/profile CREATE toasts — no JA shred', () => {
  const g = gearSuccessStatus({
    op: 'new', module: 2, teeth: 24, pitch: '48', tip: '52', root: '43.0', depth: '4.5', thickness: 10,
  }, 'ja')
  assert.match(g, /歯車/)
  assert.doesNotMatch(g, /Done:|Gear m|创建齿轮/)
  const w = wormSuccessStatus({ module: 2, starts: 1, length: 40 }, 'ja')
  assert.match(w, /ウォーム/)
  assert.doesNotMatch(w, /Done:|蜗杆/)
  const p = profileSuccessStatus({ op: 'new', name: 'L', w: 20, h: 20, t: 2, L: 100 }, 'en')
  assert.match(p, /Created/)
  // pins
  assert.equal(msg('tool.cone', 'ja'), '円錐')
  assert.match(boxSuccessStatus({ op: 'new', l: 10, w: 10, h: 10 }, 'ja'), /直方体|ボックス|作成/)
  assert.match(coneSuccessStatus({ op: 'new', d: 10, dt: 5, h: 20 }, 'ja'), /円錐|作成/)
})

test('v1.81 pins retained (Browser/File/Help/alias/寸法)', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(msg('tab.LAB', 'zh-HK'), '🧪實驗室')
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('ui.browser', 'zh-HK'), '瀏覽器')
  assert.match(msg('help.title', 'ja'), /ヘルプ|ショートカット/)
  assert.match(msg('alias.fillet', 'ja'), /フィレット/)
  assert.ok(allCatalogKeys().filter((k) => k.startsWith('alias.')).length >= 109)
  assert.equal(tStatus('尺寸', 'ja'), '寸法')
  assert.equal(tLabel('尺寸', 'ja'), '寸法')
})

test('v1.81 BD-8001: zh-HK 主視圖 / 放開 / 單擊 — no SC 主视图/松开/单击', () => {
  assert.match(msg('cmd.actFit', 'zh-HK'), /主視圖/)
  assert.doesNotMatch(msg('cmd.actFit', 'zh-HK'), /主视图/)
  assert.match(msg('status.meshDropArmed', 'zh-HK'), /放開|鬆開/)
  assert.doesNotMatch(msg('status.meshDropArmed', 'zh-HK'), /松开/)
  assert.match(msg('ui.ribbonTabToggleTip', 'zh-HK'), /單擊/)
  assert.doesNotMatch(msg('ui.ribbonTabToggleTip', 'zh-HK'), /单击/)
  assert.match(msg('vp.homeViewTip', 'zh-HK'), /主視圖/)
  assert.doesNotMatch(msg('vp.homeViewTip', 'zh-HK'), /主视图/)
  // zh-CN keeps SC
  assert.match(msg('cmd.actFit', 'zh-CN'), /主视图/)
  assert.match(msg('status.meshDropArmed', 'zh-CN'), /松开/)
  const mesh = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
  assert.match(mesh, /放開以匯入網格/)
  assert.doesNotMatch(mesh, /松开以导入网格/)
  // Ribbon no hardcoded SC home tip
  assert.match(ribbon, /msg\('cmd\.actFit'/)
  assert.doesNotMatch(ribbon, /适应窗口 \/ 主视图/)
  // BD-7301 stays closed
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
})
