/**
 * FISHING47: Formal TC SC leftovers (WindTunnel + residual UV) + Fusion CSS rhythm.
 * Diversify after FISHING46: WindTunnelGpu validation Formal + sketch-bar/ribbon CSS.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const wtg = readFileSync(new URL('../src/components/WindTunnelGpu.tsx', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const smoke = readFileSync(new URL('../src/components/WindSmoke.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('FISHING47 WindTunnelGpu: Formal TC validation / OOM fixtures', () => {
  assert.match(wtg, /格直徑，邊界層無法解，測此沒有意義/)
  assert.match(wtg, /★ 一條反彈 link 都沒有 —— 條流根本無法掂零件（phi 上傳錯了？）/)
  assert.match(wtg, /★ 分配失敗要自己 dispose 自己（walk-down 的前提）/)
  assert.match(wtg, /用完即棄該個 context 無法撐起五個 RGBA32F：/)
  assert.match(wtg, /張 texture —— walk-down 無法救/)
  assert.match(wtg, /測試無效，換個更大的尺寸/)
  assert.match(wtg, /密度擾動/)
  assert.match(wtg, /如此均勻/)
  assert.doesNotMatch(wtg, /格直径，边界层无法解/)
  assert.doesNotMatch(wtg, /一条反弹 link 都没有/)
  assert.doesNotMatch(wtg, /用完即弃该个 context 无法撑起/)
  assert.doesNotMatch(wtg, /测试无效，换个更大的尺寸/)
})

test('FISHING47 store: 稜邊 / 參數化 / 緊固件 Formal samples', () => {
  assert.match(st, /所有稜邊/)
  assert.match(st, /參數化底板/)
  assert.match(st, /漸開線齒輪/)
  assert.match(st, /六角頭螺栓/)
  assert.match(st, /蜂窩鏤空板/)
  assert.match(st, /插入緊固件/)
  assert.doesNotMatch(st, /所有棱边/)
  assert.doesNotMatch(st, /参数化底板/)
  assert.doesNotMatch(st, /六角头螺栓/)
})

test('FISHING47 Viewport / ribbon: CAD 座標 HK Formal', () => {
  assert.match(vp, /世界座標/)
  assert.match(vp, /CAD 座標/)
  assert.match(vp, /tStatus\('極坐標'/)
  assert.match(ribbon, /用戶座標系/)
  assert.match(ribbon, /座標構造點/)
  assert.match(ribbon, /關節座標幀/)
  assert.doesNotMatch(vp, /世界坐標/)
  assert.doesNotMatch(ribbon, /用戶坐標系/)
  assert.doesNotMatch(ribbon, /'坐標構造點'|坐标构造点/)
  assert.match(ribbon, /'座標構造點'/)
})

test('FISHING47 WindSmoke: GLSL comment Formal TC sample', () => {
  assert.match(smoke, /lattice cell-centre 座標/)
  assert.match(smoke, /會編譯失敗/)
  assert.doesNotMatch(smoke, /cell-centre 坐标/)
  assert.doesNotMatch(smoke, /会编译失败/)
})

test('FISHING47 Fusion CSS: sketch-bar / ribbon-tab / status rhythm', () => {
  assert.match(css, /FISHING47: Fusion-like sketch-bar \/ ribbon-tab \/ status rhythm/)
  assert.match(css, /\.sketch-bar \{ gap: 6px; padding: 6px 10px; \}/)
  assert.match(css, /\.ribbon-tab \{ padding: 6px 12px; letter-spacing: 0\.02em; \}/)
  assert.match(css, /\.status-bar \{ gap: 8px; padding: 0 10px; min-height: 26px; \}/)
  assert.match(css, /\.cmd-palette-head \{ gap: 8px; padding: 8px 12px; \}/)
})

test('FISHING47 i18n TC aliases', () => {
  assert.match(i18n, /FISHING47 Formal TC UI leftovers/)
  assert.match(i18n, /'用戶座標系': 'User Coordinate System'/)
  assert.match(i18n, /'CAD 座標': 'CAD Coordinates'/)
  assert.match(i18n, /'世界座標': 'World Coordinates'/)
})

test('FISHING46 regression: Formal + CSS still on tip', () => {
  assert.match(st, /頂面稜/)
  assert.match(st, /✓ 無干涉/)
  assert.match(vp, /label="邊界稜"/)
  assert.match(css, /FISHING46: Fusion-like browser tree \/ timeline \/ selection \/ feat-editor rhythm/)
  assert.match(css, /\.tree-row \{ min-height: 24px; height: 24px; gap: 5px; padding: 0 8px; \}/)
})
