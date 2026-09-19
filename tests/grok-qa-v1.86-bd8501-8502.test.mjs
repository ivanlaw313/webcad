/**
 * v1.86: BOT-D BD-8501/8502 leftovers from v1.85 retest.
 * BD-8501: Viewport 外觀／出圖 + assembly summary TC
 * BD-8502: hist.footer 清除瀏覽器數據
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { msg, catalogKeyCount, LOCALES, CATALOGS } from '../src/i18n.ts'
import { tStatus } from '../src/i18n.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const hk = readFileSync(new URL('../src/i18n/locales/zh-HK.ts', import.meta.url), 'utf8')
const cn = readFileSync(new URL('../src/i18n/locales/zh-CN.ts', import.meta.url), 'utf8')

test('APP_VERSION 1.91; SW webcad-v1.91', () => {
  assert.match(version, /APP_VERSION = '1\.91'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.91/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

test('BD-8501: Viewport 外觀／出圖 via tStatus; no SC 外观／出图', () => {
  assert.match(vp, /tStatus\('外觀／出圖'/)
  assert.equal(vp.includes('外观／出图'), false)
  assert.equal(tStatus('外觀／出圖', 'zh-HK'), '外觀／出圖')
  assert.equal(tStatus('外觀／出圖', 'zh-CN'), '外观／出图')
  assert.equal(tStatus('外觀／出圖', 'en'), 'Appearance / Drawing')
})

test('BD-8501: assembly summary TC labels', () => {
  assert.match(vp, /🧩 裝配 \$\{/)
  assert.match(vp, /總體積/)
  assert.match(vp, /總面積/)
  assert.match(vp, /總尺寸/)
  assert.match(vp, /總質量/)
  assert.match(vp, /實心打印~/)
  assert.match(vp, /料費~¥/)
  assert.match(vp, /質心 \(/)
  assert.equal(vp.includes('🧩 装配'), false)
  assert.equal(vp.includes('总体积'), false)
  assert.equal(vp.includes('总面积'), false)
  assert.equal(vp.includes('总质量'), false)
  assert.equal(vp.includes('实心打印~'), false)
  assert.equal(vp.includes("tStatus('料费~'"), false)
  assert.equal(traditionalToSimplified('總體積'), '总体积')
  assert.equal(traditionalToSimplified('裝配'), '装配')
  assert.equal(traditionalToSimplified('外觀／出圖'), '外观／出图')
})

test('BD-8502: hist.footer 清除瀏覽器數據', () => {
  assert.equal(msg('hist.footer', 'zh-HK').includes('清除瀏覽器數據'), true)
  assert.equal(msg('hist.footer', 'zh-HK').includes('清瀏覽器數據會'), false)
  assert.match(hk, /清除瀏覽器數據會一併清除/)
  assert.equal(hk.includes('清瀏覽器數據會一併清除'), false)
  assert.match(cn, /清除浏览器数据会一并清除/)
})

test('Pins retained', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.equal(msg('mm.fit', 'zh-HK'), '適應視窗')
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('hist.auto', 'zh-HK'), '自動')
})
