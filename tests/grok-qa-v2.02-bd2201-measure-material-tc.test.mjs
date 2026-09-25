/**
 * v2.02 BD-2201: measure / material / mat-lib status tips SC→港繁.
 * APP 2.03 + SW webcad-v2.03.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const msp = readFileSync(new URL('../src/components/MaterialSwatchPicker.tsx', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION 2.03; SW webcad-v2.03', () => {
  assert.match(version, /APP_VERSION = '2\.03'/)
  assert.match(sw, /const CACHE = 'webcad-v2\.03'/)
})

test('store measure / material tips are 港繁', () => {
  assert.match(store, /可繼續點擊落點/)
  assert.match(store, /已落草圖點/)
  assert.match(store, /對佢標尺寸/)
  assert.match(store, /測量：點擊實體上兩點量距離/)
  assert.match(store, /已退出測量/)
  assert.match(store, /量邊：點擊實體某條棱 → 顯示其長度；圓孔棱顯示直徑Ø\/半徑/)
  assert.match(store, /已退出量邊/)
  assert.match(store, /已設物理材質/)
  assert.match(store, /質量\/FEA\/BOM 用；外觀不變/)
  assert.match(store, /材質庫：請輸入預設名/)
  assert.match(store, /材質庫：搵唔到預設/)
  assert.match(store, /已把量測/)
  assert.match(store, /存為參數/)
  assert.match(store, /已存外觀預設/)
  assert.match(store, /已套用外觀預設/)
  assert.match(store, /已刪外觀預設/)
})

test('store status tips: key SC forms absent (user-visible)', () => {
  assert.doesNotMatch(store, /可继续点击落点/)
  assert.doesNotMatch(store, /已落草图点/)
  assert.doesNotMatch(store, /测量：点击实体上两点量距离/)
  assert.doesNotMatch(store, /已退出测量/)
  assert.doesNotMatch(store, /量边：点击实体某条棱/)
  assert.doesNotMatch(store, /已退出量边/)
  assert.doesNotMatch(store, /已设物理材质/)
  assert.doesNotMatch(store, /材质库：请输入预设名/)
  assert.doesNotMatch(store, /材质库：搵唔到预设/)
  assert.doesNotMatch(store, /已把量测/)
  assert.doesNotMatch(store, /已存外观预设/)
  assert.doesNotMatch(store, /已套用外观预设/)
  assert.doesNotMatch(store, /已删外观预设/)
})

test('MaterialSwatchPicker 物理材質 TC; SC absent in UI', () => {
  assert.match(msp, /物理材質/)
  assert.match(msp, /物理材質：/)
  // strip // comments then assert no SC UI label
  const noComments = msp.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
  assert.doesNotMatch(noComments, /物理材质/)
})

test('Viewport mat-lib chrome TC; SC absent in tStatus args', () => {
  assert.match(vp, /外觀材質庫/)
  assert.match(vp, /外觀預設名（存當前顏色\+金屬度\+粗糙度\+紋理）/)
  assert.match(vp, /我的材質/)
  assert.match(vp, /📚 外觀材質庫（S187）/)
  assert.doesNotMatch(vp, /tStatus\('外观材质库'/)
  assert.doesNotMatch(vp, /tStatus\('我的材质'/)
  assert.doesNotMatch(vp, /tStatus\('外观预设名/)
  assert.doesNotMatch(vp, /tStatus\('📚 外观材质库/)
})

test('App ESC measure tip TC', () => {
  assert.match(app, /已退出測量/)
  assert.doesNotMatch(app, /已退出测量/)
})

test('i18n has TC + legacy SC measure/material keys', () => {
  assert.match(i18n, /v2\.02 BD-2201/)
  assert.match(i18n, /測量：點擊實體上兩點量距離/)
  assert.match(i18n, /测量：点击实体上两点量距离/)
  assert.match(i18n, /材質庫：請輸入預設名/)
  assert.match(i18n, /材质库：请输入预设名/)
  assert.match(i18n, /外觀材質庫/)
  assert.match(i18n, /外观材质库/)
  assert.match(i18n, /已把量測/)
  assert.match(i18n, /已把量测/)
})
