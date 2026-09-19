/**
 * v1.82: continue clearing four-locale i18n leftovers after v1.81.
 * commandAvailability catalog · profile.name L/U/T · MarkingMenu mm.* · tip.* expand
 * · ribbon tip SC→TC (绕/特征/弹簧…) · no EN shred on profile/JA
 * Pins: BD-7301/8001 · Browser/File TC · JA 寸法/円錐 · MarkingMenu · sample.* · tip.* · HelpPanel · CommandPalette
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  msg, catalogKeyCount, allCatalogKeys, LOCALES, CATALOGS, tLabel,
} from '../src/i18n.ts'
import {
  profileSuccessStatus, profileSectionName, gearSuccessStatus, coneSuccessStatus,
} from '../src/ui/featureStatus.ts'
import { commandDisabledReason } from '../src/cad/commandAvailability.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const avail = readFileSync(new URL('../src/cad/commandAvailability.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.82; SW CACHE webcad-v1.82', () => {
  assert.match(version, /APP_VERSION = '1\.82'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.82'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.81'/)
})

test('v1.82: catalog parity ≥950; ui.disabled.* + profile.name + mm leftovers + tip expand', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 950, `expected ≥950 keys, got ${counts[0]}`)
  const keys = allCatalogKeys()
  for (const k of [
    'ui.disabled.skDrag', 'ui.disabled.busy', 'ui.disabled.activeCmd',
    'ui.disabled.pickPlane', 'ui.disabled.finishSketch', 'ui.disabled.openSketch',
    'ui.disabled.formUnsupported', 'ui.disabled.formBusy', 'ui.disabled.finishForm',
    'profile.name.L', 'profile.name.U', 'profile.name.T',
    'mm.delete', 'mm.moveCopy', 'mm.finishSketch', 'mm.createSketch', 'mm.stackVert',
    'tip.createform', 'tip.circpattern', 'tip.splitbody', 'tip.appearance', 'tip.thicken',
    'sample.gear', 'tip.box', 'mm.dimD', 'sk.dimension', 'alias.cone',
    'status.meshDropArmed', 'vp.homeViewTip', 'file.importStl', 'file.history',
  ]) {
    assert.ok(keys.includes(k), `missing ${k}`)
    for (const L of LOCALES) assert.ok(k in CATALOGS[L], `${L} missing ${k}`)
  }
  const tips = keys.filter((k) => k.startsWith('tip.'))
  const mms = keys.filter((k) => k.startsWith('mm.'))
  assert.ok(tips.length >= 40, `tip count ${tips.length}`)
  assert.ok(mms.length >= 40, `mm count ${mms.length}`)
})

test('v1.82: commandAvailability uses msg(ui.disabled.*) — no SC 请先放开鼠标', () => {
  assert.match(avail, /msg\('ui\.disabled\.skDrag'/)
  assert.match(avail, /msg\('ui\.disabled\.finishSketch'/)
  assert.equal(avail.split('请先放开鼠标').length - 1, 0)
  assert.equal(avail.split('请先完成草图').length - 1, 0)
  const drag = commandDisabledReason({ skDrag: true, lang: 'zh-HK' }, 'box')
  assert.match(drag, /放開|滑鼠/)
  assert.doesNotMatch(drag, /放开|鼠标/)
  assert.match(commandDisabledReason({ skDrag: true, lang: 'ja' }, 'box'), /ドラッグ|Esc/)
  assert.match(commandDisabledReason({ skDrag: true, lang: 'en' }, 'box'), /Release|Esc/i)
  assert.match(commandDisabledReason({ busy: true, lang: 'zh-CN' }, 'box'), /计算/)
})

test('v1.82: profile.name L/U/T localized — no SC 槽钢/角铁 in toast', () => {
  assert.match(store, /profileSectionName\(/)
  assert.equal(store.split("'U 槽钢'").length - 1, 0)
  assert.equal(store.split("'L 角铁'").length - 1, 0)
  assert.match(msg('profile.name.L', 'zh-HK'), /L\s*角鐵/)
  assert.match(msg('profile.name.U', 'zh-HK'), /U\s*槽鋼/)
  assert.match(profileSectionName('L', 'zh-HK'), /L\s*角鐵/)
  assert.equal(profileSectionName('U', 'ja'), 'Uチャンネル')
  assert.doesNotMatch(msg('profile.name.L', 'zh-HK'), /角铁/)
  assert.doesNotMatch(msg('profile.name.U', 'zh-HK'), /槽钢/)
  const p = profileSuccessStatus({
    op: 'new', name: profileSectionName('L', 'ja'), w: 20, h: 20, t: 2, L: 100,
  }, 'ja')
  assert.match(p, /Lアングル|作成/)
  assert.doesNotMatch(p, /Done:|角铁|槽钢/)
  const en = profileSuccessStatus({
    op: 'new', name: profileSectionName('U', 'en'), w: 40, h: 20, t: 3, L: 200,
  }, 'en')
  assert.match(en, /U-channel|Created/)
  assert.doesNotMatch(en, /槽钢|Done:/)
})

test('v1.82: Viewport MM uses mm.* catalog; no SC runCommand args', () => {
  assert.match(viewport, /msg\('mm\.delete'/)
  assert.match(viewport, /msg\('mm\.finishSketch'/)
  assert.match(viewport, /msg\('mm\.createSketch'/)
  assert.match(viewport, /msg\('mm\.stackVert'/)
  assert.equal(viewport.split("runCommand('sk_mirrory', '镜像')").length - 1, 0)
  assert.equal(viewport.split("runCommand('facefillet', '面圆角')").length - 1, 0)
  assert.equal(viewport.split("runCommand('sketcharray', '阵列轮廓')").length - 1, 0)
})

test('v1.82: ribbon tip source SC→TC (绕/特征/弹簧)', () => {
  assert.equal(ribbonSrc.split('绕任意軸').length - 1, 0)
  assert.equal(ribbonSrc.split('绕一條軸').length - 1, 0)
  assert.equal(ribbonSrc.split('所選特征').length - 1, 0)
  assert.equal(ribbonSrc.split('螺旋/弹簧').length - 1, 0)
  assert.match(ribbonSrc, /繞任意軸/)
  assert.match(ribbonSrc, /所選特徵/)
  assert.match(ribbonSrc, /螺旋\/彈簧/)
})

test('v1.82 pins: BD-8001 TC · JA 寸法/円錐 · Browser/File · sample/tip', () => {
  assert.match(msg('status.meshDropArmed', 'zh-HK'), /放開.*匯入網格/)
  assert.match(msg('status.meshDropArmed', 'zh-HK'), /放開滑鼠|放開以/)
  assert.doesNotMatch(msg('status.meshDropArmed', 'zh-HK'), /松开|导入网格/)
  assert.match(msg('vp.homeViewTip', 'zh-HK'), /主視圖/)
  assert.doesNotMatch(msg('vp.homeViewTip', 'zh-HK'), /主视图/)
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('sk.dimension', 'ja'), '寸法')
  assert.equal(msg('tool.cone', 'ja'), '円錐')
  assert.equal(msg('mm.dimD', 'ja'), '寸法 (D)')
  assert.match(msg('sample.gear', 'ja'), /歯車/)
  const g = gearSuccessStatus({
    op: 'new', module: 2, teeth: 24, pitch: '48', tip: '52', root: '43.0', depth: '4.5', thickness: 10,
  }, 'ja')
  assert.match(g, /歯車/)
  assert.doesNotMatch(g, /Done:|Gear m|创建齿轮/)
  assert.match(coneSuccessStatus({ op: 'new', d: 20, dt: 0, h: 30 }, 'ja'), /円錐|円台|作成/)
})

test('v1.82: tip.createform / circpattern four-locale (no EN shred short token)', () => {
  assert.match(msg('tip.createform', 'ja'), /FORM|フォーム/)
  assert.match(msg('tip.circpattern', 'en'), /Circular|pattern/i)
  assert.doesNotMatch(msg('tip.circpattern', 'ja'), /\bDone\b|Dimension/)
  assert.equal(tLabel('圓角', 'ja').length > 0, true)
})
