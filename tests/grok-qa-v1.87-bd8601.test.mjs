/**
 * v1.87: BOT-D BD-8601 — Ribbon tooltip 外观颜色 → 外觀顏色
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { msg, catalogKeyCount, LOCALES, CATALOGS, tStatus } from '../src/i18n.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

const TIP = '外觀顏色：點擊色塊選擇顏色，立即套用到當前實體'

test('APP_VERSION 1.92; SW webcad-v1.92', () => {
  assert.match(version, /APP_VERSION = '1\.92'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.92/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

test('BD-8601: Ribbon appearance color tooltip via tStatus; no SC 外观颜色', () => {
  assert.match(ribbon, /tStatus\('外觀顏色：點擊色塊選擇顏色，立即套用到當前實體'/)
  assert.equal(ribbon.includes('外观颜色'), false)
  assert.equal(tStatus(TIP, 'zh-HK'), TIP)
  assert.equal(tStatus(TIP, 'zh-CN'), '外观颜色：点击色块选择颜色，立即套用到当前实体')
  assert.match(tStatus(TIP, 'en'), /Appearance color/i)
  assert.equal(traditionalToSimplified('外觀顏色'), '外观颜色')
})


test('BD-8601b: Viewport/propsReport 體積; no SC 体积 in HUD/props labels', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  const pr = readFileSync(new URL('../src/cad/propsReport.ts', import.meta.url), 'utf8')
  assert.match(vp, /tStatus\('體積'/)
  assert.equal(vp.includes("tStatus('体积'"), false)
  assert.match(pr, /label: '體積'/)
  assert.equal(pr.includes("label: '体积'"), false)
  assert.equal(tStatus('體積', 'zh-HK'), '體積')
  assert.equal(tStatus('體積', 'zh-CN'), '体积')
  assert.equal(tStatus('體積', 'en'), 'volume')
})

test('Pins retained', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.equal(msg('mm.fit', 'zh-HK'), '適應視窗')
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('hist.auto', 'zh-HK'), '自動')
  assert.equal(msg('hist.footer', 'zh-HK').includes('清除瀏覽器數據'), true)
})
