/**
 * v1.84: BD-7301 residual — HistoryPanel SC「版本历史／浏览器」→ hist.* catalog (TC).
 * Retain File 匯入 STL…／版本歷史… + Browser 瀏覽器／組件／實體／特徵.
 * Pins: 插入STL网格 · 實驗室 · 尺寸已拒絕 · 日本語 · JA tool.* · HelpPanel · box JP toast.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { msg, catalogKeyCount, LOCALES, allCatalogKeys, CATALOGS } from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const hist = readFileSync(new URL('../src/components/HistoryPanel.tsx', import.meta.url), 'utf8')
const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.85; SW CACHE webcad-v1.85', () => {
  assert.match(version, /APP_VERSION = '1\.85'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.85'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.83'/)
})

test('v1.84: catalog parity; hist.* keys', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 1300, `expected ≥1300 keys, got ${counts[0]}`)
  for (const k of ['hist.title', 'hist.idbUnavailable', 'hist.footer', 'hist.saveCurrent']) {
    assert.ok(allCatalogKeys().includes(k), `missing ${k}`)
  }
})

test('v1.84 BD-7301: File + Browser zh-HK TC; HistoryPanel catalog', () => {
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.doesNotMatch(msg('file.importStl', 'zh-HK'), /导入/)
  assert.doesNotMatch(msg('file.history', 'zh-HK'), /历史/)
  assert.equal(msg('ui.browser', 'zh-HK'), '瀏覽器')
  assert.equal(msg('tree.components', 'zh-HK'), '組件')
  assert.equal(msg('tree.bodies', 'zh-HK'), '實體')
  assert.equal(msg('tree.features', 'zh-HK'), '特徵')
  // SC locale keeps simplified
  assert.equal(msg('file.importStl', 'zh-CN'), '导入 STL…')
  assert.equal(msg('ui.browser', 'zh-CN'), '浏览器')
  assert.equal(msg('hist.title', 'zh-HK'), '版本歷史')
  assert.equal(msg('hist.title', 'zh-CN'), '版本历史')
  assert.match(msg('hist.idbUnavailable', 'zh-HK'), /瀏覽器/)
  assert.doesNotMatch(msg('hist.idbUnavailable', 'zh-HK'), /浏览器/)
  assert.match(hist, /msg\('hist\.title'/)
  assert.match(hist, /msg\('hist\.idbUnavailable'/)
  assert.match(hist, /msg\('hist\.footer'/)
  assert.doesNotMatch(hist, /版本历史/)
  assert.doesNotMatch(hist, /此浏览器/)
  assert.match(ribbon, /msg\('file\.importStl'/)
  assert.match(ribbon, /msg\('file\.history'/)
  assert.match(tree, /msg\('ui\.browser'/)
  assert.match(tree, /msg\('tree\.components'/)
  assert.match(tree, /msg\('tree\.bodies'/)
  assert.match(tree, /msg\('tree\.features'/)
  for (const sc of ['浏览器', '组件', '实体', '特征']) {
    assert.equal(tree.split(sc).length - 1, 0, `BrowserTree still has SC 「${sc}」`)
  }
})

test('Pins retained', () => {
  assert.match(ribbonSrc, /id: 'insertmesh', label: '插入STL网格'/)
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.match(ribbonSrc, /'🧪實驗室'/)
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.match(ribbon, /日本語/)
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')
  assert.ok(allCatalogKeys().includes('help.title'))
  assert.equal(msg('status.boxCreated', 'ja'), 'ボックスを作成しました {0}×{1}×{2}')
})
