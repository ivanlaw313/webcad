/**
 * v1.90 BD-8801 / BD-8701 leftovers: fillet dialog SC→TC + 面圓角 type option + status TC
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { msg, catalogKeyCount, LOCALES, CATALOGS, tStatus } from '../src/i18n.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('APP_VERSION 1.96; SW webcad-v1.96', () => {
  assert.match(version, /APP_VERSION = '1\.96'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.96/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

test('BD-8801: fillet dialog TC — 類型／邊／面／特徵／面圓角', () => {
  assert.match(vp, />類型</)
  assert.equal(vp.includes(">类型</"), false)
  assert.match(vp, /label="邊／面／特徵"/)
  assert.equal(vp.includes('label="边/面/特征"'), false)
  assert.equal(vp.includes('边/面/特征'), false)
  assert.match(vp, /option value="face">面圓角</)
  assert.match(vp, /option value="full">全圓角</)
  assert.match(vp, /option value="fillet">圓角</)
  assert.match(vp, /option value="rule">規則圓角</)
  assert.match(vp, /title="面圓角"/)
  assert.match(vp, /v === 'face'/)
  assert.match(vp, /toggleFaceFillet/)
})

test('BD-8701 leftover status: 圓角：逐條點選邊／面／特徵', () => {
  assert.match(store, /圓角：逐條點選邊／面／特徵/)
  assert.equal(store.includes('圆角：逐条点选边/面/特征'), false)
  assert.equal(tStatus('圓角：逐條點選邊／面／特徵', 'zh-HK'), '圓角：逐條點選邊／面／特徵')
  assert.equal(
    traditionalToSimplified('圓角：逐條點選邊／面／特徵'),
    '圆角：逐条点选边／面／特征',
  )
  assert.equal(tStatus('類型', 'zh-HK'), '類型')
  assert.equal(tStatus('類型', 'zh-CN'), '类型')
  assert.equal(tStatus('特徵', 'zh-CN'), '特征')
})

test('Pins retained', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.equal(msg('mm.fit', 'zh-HK'), '適應視窗')
  assert.equal(msg('hist.footer', 'zh-HK').includes('清除瀏覽器數據'), true)
})
