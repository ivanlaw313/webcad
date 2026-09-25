/**
 * v1.97: locale-v196 FAIL leftovers + BOT-D BD-9601/9602/9603 residuals.
 * Move/Copy tips TC; datum axis tip 構造軸／順序拾／圓柱面; ribbon 構造軸.
 * MESH pin 插入STL網格 (TC). APP 2.00 + SW webcad-v2.00.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const tex = readFileSync(new URL('../src/render/procTextures.ts', import.meta.url), 'utf8')
const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')

test('APP_VERSION 2.00; SW webcad-v2.00', () => {
  assert.match(version, /APP_VERSION = '2\.00'/)
  assert.match(sw, /const CACHE = 'webcad-v2\.00/)
})

test('BD-9603 move/copy tips + labels TC', () => {
  assert.match(vp, /tStatus\('實體', lang\)/)
  assert.match(vp, /分割後可選擇泊車半體移動/)
  assert.match(vp, /移動一個副本/)
  assert.match(vp, /繞件中心 X 軸旋轉/)
  assert.match(vp, /面（用移動面）/)
  assert.match(vp, /草圖（草圖環境）/)
  assert.match(vp, /tStatus\('建立副本', lang\)/)
  assert.doesNotMatch(vp, /分割后可选择/)
  assert.doesNotMatch(vp, /移动一个副本/)
  assert.doesNotMatch(vp, /tStatus\('实体', lang\)/)
  assert.doesNotMatch(vp, /tStatus\('创建副本', lang\)/)
  assert.doesNotMatch(vp, /绕件中心 X 轴/)
})

test('BD-9602 construction axis tip + chip TC', () => {
  assert.match(vp, /dc\.type === 'axis' \? '構造軸'/)
  assert.match(vp, /t === 'axis' \? '軸'/)
  assert.match(vp, /\? '圓柱面'/)
  assert.match(store, /type === 'axis' \? '構造軸' : type === 'point' \? '構造點' : '構造幾何'/)
  assert.match(store, /🎯 順序拾/)
  assert.match(store, /一個圓柱面/)
  assert.match(store, /label: '過圓柱\/錐面'/)
  assert.match(ribbonSrc, /id: 'caxis', label: '構造軸'/)
  assert.doesNotMatch(store, /🎯 顺序拾/)
  assert.doesNotMatch(store, /一个圆柱面/)
  assert.doesNotMatch(vp, /\? '圆柱面'/)
  assert.doesNotMatch(store, /构造几何 ·/)
})

test('BD-9601 ribbon/texture/joint/browser TC', () => {
  assert.match(ribbon, /title="材質預設"/)
  assert.match(ribbon, /title="紋理"/)
  assert.match(tex, /wood: '木紋'/)
  assert.match(tex, /brushed: '拉絲'/)
  assert.match(tex, /matte: '磨砂'/)
  assert.match(store, /關節拾取：先點/)
  assert.match(tree, /雙擊參數化件=進入編輯/)
  assert.match(tree, /每個可見零件/)
  assert.doesNotMatch(ribbon, /title="材质预设"/)
  assert.doesNotMatch(tex, /木纹|拉丝/)
  assert.doesNotMatch(store, /关节拾取：先点/)
})

test('MESH pin 插入STL網格 (TC)', () => {
  assert.match(ribbonSrc, /插入STL網格/)
  assert.doesNotMatch(ribbonSrc, /插入STL网格/)
})
