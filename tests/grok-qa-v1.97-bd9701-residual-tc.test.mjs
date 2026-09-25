/**
 * v1.97 BD-9701: residual SC→HK TC (MESH pin, Ribbon titles/confirms,
 * Viewport prefs / press-pull / shell / sketch-text).
 * APP 2.00 + SW webcad-v2.00.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION 2.00; SW webcad-v2.00', () => {
  assert.match(version, /APP_VERSION = '2\.00'/)
  assert.match(sw, /const CACHE = 'webcad-v2\.00/)
})

test('BD-9701 MESH pin 插入STL網格 (no SC 网格)', () => {
  assert.match(ribbonSrc, /插入STL網格/)
  assert.doesNotMatch(ribbonSrc, /插入STL网格/)
  assert.match(i18n, /'插入STL網格': 'Insert STL'/)
})

test('BD-9701 Ribbon fastener/clear/template TC', () => {
  assert.match(ribbon, /title="插入標準件到裝配/)
  assert.match(ribbon, /appConfirm\('清空全部？當前模型（特徵 \+ 組件）/)
  assert.match(ribbon, /title="載入選中的起始模板/)
  assert.match(ribbon, /appConfirm\('載入模板會清空當前項目/)
  assert.doesNotMatch(ribbon, /插入标准件到装配/)
  assert.doesNotMatch(ribbon, /清空全部？当前模型（特征 \+ 组件）/)
  assert.doesNotMatch(ribbon, /载入选中的起始模板/)
  assert.doesNotMatch(ribbon, /载入模板会清空当前项目/)
})

test('BD-9701 Viewport prefs TC', () => {
  assert.match(vp, /tStatus\('關閉', lang\)/)
  assert.match(vp, /tStatus\('自動', lang\)/)
  assert.match(vp, /tStatus\('淺色', lang\)/)
  assert.match(vp, /tStatus\('深色', lang\)/)
  assert.match(vp, /label="新文件預設單位"/)
  assert.match(vp, /label="進入草圖自動正視（正交）"/)
  assert.match(vp, /tStatus\('恢復預設', lang\)/)
  assert.doesNotMatch(vp, /tStatus\('关闭', lang\)/)
  assert.doesNotMatch(vp, /tStatus\('自动', lang\)/)
  assert.doesNotMatch(vp, /tStatus\('浅色', lang\)/)
  assert.doesNotMatch(vp, /label="新文档默认单位"/)
  assert.doesNotMatch(vp, /tStatus\('恢复默认', lang\)/)
})

test('BD-9701 press-pull / shell / sketch-text TC', () => {
  assert.match(vp, /tStatus\('選擇', lang\)/)
  assert.match(vp, /tStatus\('修改現有特徵', lang\)/)
  assert.match(vp, /shellType === 'closed' \? '實體'/)
  assert.match(vp, /T\('T 草圖文字'\)/)
  assert.match(vp, /T\('✓ 確定'\)/)
  assert.doesNotMatch(vp, /tStatus\('选择', lang\)/)
  assert.doesNotMatch(vp, /tStatus\('修改现有特征', lang\)/)
  assert.doesNotMatch(vp, /shellType === 'closed' \? '实体'/)
  assert.doesNotMatch(vp, /T\('T 草图文字'\)/)
  assert.doesNotMatch(vp, /T\('✓ 确定'\)/)
})

test('BD-9701 i18n TC→EN mappings present', () => {
  assert.match(i18n, /'關閉': 'Close'/)
  assert.match(i18n, /'自動': 'Auto'/)
  assert.match(i18n, /'淺色': 'Light'/)
  assert.match(i18n, /'恢復預設': 'Reset Defaults'/)
  assert.match(i18n, /'修改現有特徵': 'Modify Existing Feature'/)
  assert.match(i18n, /'T 草圖文字': 'T Sketch Text'/)
  assert.match(i18n, /v1\.97 BD-9701/)
})
