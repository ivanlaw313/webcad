/**
 * v1.90 BD-8901: fillet radius-group status / dialog SC→TC
 * BOT-D @1.89 leftover: 半径组 1 已激活：之后点选嘅边会加入呢组；棱／半径
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

test('APP_VERSION 1.90; SW webcad-v1.90', () => {
  assert.match(version, /APP_VERSION = '1\.90'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.90/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

test('BD-8901: radius-group status TC — 半徑組已啟用', () => {
  assert.match(store, /半徑組 \$\{i \+ 1\} 已啟用：之後點選嘅邊會加入呢組/)
  assert.equal(store.includes('半径组'), false)
  assert.equal(store.includes('已激活：之后点选'), false)
  assert.equal(store.includes('之后点选嘅边会加入呢组'), false)
  assert.match(store, /半徑組 \$\{groups\.length\}：請點選邊並輸入半徑/)
  assert.match(store, /已刪除半徑組/)
})

test('BD-8901: fillet dialog 棱→稜 / 半径→半徑', () => {
  assert.match(vp, /條稜/)
  assert.equal(vp.includes('條棱'), false)
  assert.match(vp, /要處理的稜/)
  assert.equal(vp.includes('要處理的棱'), false)
  assert.match(vp, /自動連相切稜/)
  assert.equal(vp.includes('自動連相切棱'), false)
  assert.match(vp, /半徑組 \$\{gi \+ 1\} 半徑 mm/)
  assert.equal(vp.includes('半径组'), false)
  assert.match(vp, />半徑</)
  assert.match(vp, /末端半徑 \(變徑\)/)
  assert.match(vp, /新增半徑組/)
  assert.match(vp, /刪除半徑組/)
  assert.match(vp, /選中第 \{filletActiveGroup \+ 1\} 組/)
})

test('BD-8901: tStatus / tc2sc for radius-group phrase', () => {
  const tc = '半徑組 1 已啟用：之後點選嘅邊會加入呢組'
  assert.equal(tStatus(tc, 'zh-HK'), tc)
  const sc = traditionalToSimplified(tc)
  assert.match(sc, /半径组/)
  assert.match(sc, /已启用/)
  assert.equal(tStatus('半徑組', 'zh-HK'), '半徑組')
  assert.equal(tStatus('稜', 'zh-HK'), '稜')
})

test('Pins retained', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.equal(msg('mm.fit', 'zh-HK'), '適應視窗')
  assert.equal(msg('hist.footer', 'zh-HK').includes('清除瀏覽器數據'), true)
})
