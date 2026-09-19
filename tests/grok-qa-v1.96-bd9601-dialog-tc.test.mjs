/**
 * v1.97 BD-9601 + locale-v195: ribbon/store/Viewport SC→TC residuals
 * (template/fastener/material/texture; joint/motion; move dialog; datum axis).
 * APP 1.97 + SW webcad-v1.97. MESH pin now 插入STL網格 (TC).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const tex = readFileSync(new URL('../src/render/procTextures.ts', import.meta.url), 'utf8')
const cmd = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')

test('APP_VERSION 1.97; SW webcad-v1.97', () => {
  assert.match(version, /APP_VERSION = '1\.97'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.97/)
})

test('BD-9601 ribbon titles TC', () => {
  assert.match(ribbon, /title="選擇起始模板"/)
  assert.match(ribbon, /title="標準件類型（ISO 標準尺寸）"/)
  assert.match(ribbon, /title="公制規格"/)
  assert.match(ribbon, /title="材質預設"/)
  assert.match(ribbon, /title="紋理"/)
  assert.doesNotMatch(ribbon, /title="选择起始模板"/)
  assert.doesNotMatch(ribbon, /title="材质预设"/)
})

test('BD-9601 texture labels TC', () => {
  assert.match(tex, /wood: '木紋'/)
  assert.match(tex, /brushed: '拉絲'/)
  assert.match(tex, /matte: '磨砂'/)
  assert.match(tex, /'': '無'/)
  assert.doesNotMatch(tex, /木纹|拉丝/)
})

test('BD-9601 joint/motion + browser tips TC', () => {
  assert.match(store, /關節拾取：先點/)
  assert.match(store, /運動連接需要最少 2 個轉動／圓柱關節/)
  assert.match(tree, /雙擊參數化件=進入編輯/)
  assert.match(tree, /每個可見零件/)
  assert.doesNotMatch(store, /运动连接需要最少 2 个转动/)
  assert.doesNotMatch(store, /关节拾取：先点/)
})

test('locale-v195 move dialog residuals TC', () => {
  assert.match(vp, /tStatus\('對象', lang\)/)
  assert.match(vp, /tStatus\('實體', lang\)/)
  assert.match(vp, /tStatus\('活動實體', lang\)/)
  assert.match(vp, /tStatus\('建立副本', lang\)/)
  assert.match(vp, /\['ptp', '點對點'/)
  assert.match(cmd, /tStatus\('已選', lang\)/)
  assert.doesNotMatch(vp, /tStatus\('创建副本', lang\)/)
  assert.doesNotMatch(vp, /tStatus\('对象', lang\)/)
  assert.doesNotMatch(cmd, /tStatus\('已选', lang\)/)
})

test('locale-v195 construction axis dialog TC', () => {
  assert.match(vp, /t === 'axis' \? '軸' : '點'/)
  assert.match(vp, /dc\.type === 'axis' \? '構造軸'/)
  assert.match(store, /type === 'axis' \? '構造軸' : type === 'point' \? '構造點' : '構造幾何'/)
  assert.match(store, /_datumMethodLabel/)
  assert.match(store, /label: '方向 X\/Y\/Z \+ 過點'/)
  assert.doesNotMatch(store, /构造几何 ·/)
  assert.doesNotMatch(vp, /t === 'axis' \? '轴'/)
})

test('MESH pin now TC 插入STL網格 (lifted in v1.97 BD-9701)', () => {
  const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
  assert.match(ribbonSrc, /插入STL網格/)
  assert.doesNotMatch(ribbonSrc, /插入STL网格/)
})
