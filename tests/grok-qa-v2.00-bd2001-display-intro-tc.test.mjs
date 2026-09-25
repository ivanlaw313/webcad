/**
 * v2.00 BD-2001: display-style menu + IntroCard + title SC→港繁.
 * Closes BUG-BD-9901 / 9902 / 9903. APP 2.00 + SW webcad-v2.00.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vm = readFileSync(new URL('../src/cad/viewModel.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const intro = readFileSync(new URL('../src/components/IntroCard.tsx', import.meta.url), 'utf8')
const idx = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const bt = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION 2.03; SW webcad-v2.03', () => {
  assert.match(version, /APP_VERSION = '2\.03'/)
  assert.match(sw, /const CACHE = 'webcad-v2\.03'/)
})

test('VISUAL_STYLE_LABELS all TC; no SC label values', () => {
  assert.match(vm, /shaded: '著色'/)
  assert.match(vm, /shadedHidden: '著色 \+ 隱藏邊'/)
  assert.match(vm, /shadedVisible: '著色 \+ 可見邊'/)
  assert.match(vm, /wire: '線框'/)
  assert.match(vm, /wireHidden: '線框 \+ 隱藏邊'/)
  assert.match(vm, /wireVisible: '線框 \+ 可見邊'/)
  // SC forms must not appear as label string values
  assert.doesNotMatch(vm, /shaded: '着色'/)
  assert.doesNotMatch(vm, /'着色 \+ 隐藏边'/)
  assert.doesNotMatch(vm, /wire: '线框'/)
  assert.doesNotMatch(vm, /'线框 \+ 隐藏边'/)
})

test('Viewport B-rep 視覺樣式; no B-rep 视觉样式', () => {
  assert.match(vp, /B-rep 視覺樣式/)
  assert.doesNotMatch(vp, /B-rep 视觉样式/)
  assert.match(vp, /文檔單位/)
})

test('store setVisualStyle status TC', () => {
  assert.match(store, /視覺樣式：\$\{\(\{ shaded: '著色'/)
  assert.doesNotMatch(store, /视觉样式：\$\{\(\{ shaded: '着色'/)
})

test('IntroCard TC; no key SC forms', () => {
  assert.match(intro, /快速開始/)
  assert.match(intro, /載入/)
  assert.match(intro, /手把手教學/)
  assert.match(intro, /第一個零件/)
  assert.match(intro, /睇完整幫助/)
  assert.match(intro, /知道了，開始/)
  assert.doesNotMatch(intro, /快速开始/)
  assert.doesNotMatch(intro, /手把手教学/)
  assert.doesNotMatch(intro, /第一个零件/)
  assert.doesNotMatch(intro, /载入一个模板/)
})

test('index.html 代號; no 代号', () => {
  assert.match(idx, /代號/)
  assert.doesNotMatch(idx, /代号/)
})

test('BrowserTree 文檔單位 leaf; UnitDialog heading present', () => {
  assert.match(bt, /文檔單位:/)
  assert.match(vp, /tStatus\('文檔單位', lang\)/)
})

test('i18n has TC + legacy SC keys for visual styles', () => {
  assert.match(i18n, /'B-rep 視覺樣式':/)
  assert.match(i18n, /'B-rep 视觉样式':/)
  assert.match(i18n, /'著色':/)
  assert.match(i18n, /'着色':/)
  assert.match(i18n, /'快速開始':/)
  assert.match(i18n, /'快速开始':/)
})
