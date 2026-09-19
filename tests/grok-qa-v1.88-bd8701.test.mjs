/**
 * v1.90 BD-8701: fillet/chamfer/face-fillet dialog TC + BD-8601b 體積 ship
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { msg, catalogKeyCount, LOCALES, CATALOGS, tStatus } from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const pr = readFileSync(new URL('../src/cad/propsReport.ts', import.meta.url), 'utf8')

test('APP_VERSION 1.93; SW webcad-v1.93', () => {
  assert.match(version, /APP_VERSION = '1\.93'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.93/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

test('BD-8701: fillet dialog TC — 確定／圓角／規則圓角／面圓角', () => {
  assert.match(vp, /確定（\$\{edgeRoundPicks\.length\}）/)
  assert.equal(vp.includes('`确定（${edgeRoundPicks.length}）`'), false)
  assert.match(vp, /option value="fillet">圓角</)
  assert.match(vp, /option value="rule">規則圓角</)
  assert.match(vp, /option value="full">全圓角</)
  assert.match(vp, /option value="face">面圓角</)
  assert.equal(vp.includes('>规则圆角<'), false)
  assert.equal(vp.includes('>圆角</option>'), false)
  assert.match(vp, /title="面圓角"/)
  assert.match(vp, /確定（\$\{faceFilletPicks\.length\}\/2）/)
  assert.equal(vp.includes('title="面圆角"'), false)
  assert.equal(tStatus('面圓角', 'zh-HK'), '面圓角')
  assert.equal(tStatus('面圓角', 'zh-CN'), '面圆角')
  assert.equal(tStatus('規則圓角', 'zh-CN'), '规则圆角')
  assert.equal(tStatus('確定', 'zh-CN'), '确定')
})

test('BD-8601/8601b retained: 外觀顏色 + 體積', () => {
  assert.match(ribbon, /tStatus\('外觀顏色：點擊色塊選擇顏色，立即套用到當前實體'/)
  assert.equal(ribbon.includes('外观颜色'), false)
  assert.match(vp, /tStatus\('體積'/)
  assert.equal(vp.includes("tStatus('体积'"), false)
  assert.match(pr, /label: '體積'/)
  assert.equal(pr.includes("label: '体积'"), false)
})

test('Pins retained', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.equal(msg('mm.fit', 'zh-HK'), '適應視窗')
  assert.equal(msg('hist.footer', 'zh-HK').includes('清除瀏覽器數據'), true)
})
