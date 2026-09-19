/**
 * v1.84: BD-8201 profile 寬; BD-8301 nav/timeline TC; BD-8302 mesh chrome;
 * toast 網格參數化／重建為; BD-8303 HistoryPanel confirms via hist.*.
 * Keep shipping BD-8201 宽→寬 + BD-8301/02/03.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { msg, catalogKeyCount, LOCALES, allCatalogKeys, CATALOGS } from '../src/i18n.ts'
import { tStatus } from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const hist = readFileSync(new URL('../src/components/HistoryPanel.tsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const cmd = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')

test('APP_VERSION 1.89; SW webcad-v1.89', () => {
  assert.match(version, /APP_VERSION = '1\.89'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.89'/)
})

test('catalog parity ≥1314', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 1314)
})

test('BD-8201: profile/dialog 寬 not 宽; OK 確定', () => {
  assert.match(vp, /tStatus\('寬'/)
  assert.equal(vp.split("tStatus('宽'").length - 1, 0)
  assert.match(vp, /tStatus\('確定'/)
  assert.match(cmd, /okLabel = '確定'/)
  assert.equal(tStatus('寬', 'zh-HK'), '寬')
  assert.equal(tStatus('寬', 'zh-CN'), '宽')
  assert.equal(tStatus('寬', 'en'), 'Width')
})

test('BD-8301: nav 顯示 + timeline 並', () => {
  assert.match(vp, /tStatus\('顯示'/)
  assert.doesNotMatch(vp, /tStatus\('显示'/)
  assert.match(tl, /可改參數並自動重建/)
  assert.doesNotMatch(tl, /可改參數并自動重建/)
  assert.match(vp, /外觀與出圖/)
})

test('BD-8302: mesh panel 移動/旋轉 繞X° 歸零 體積', () => {
  assert.match(vp, /tStatus\('移動\/旋轉'/)
  assert.match(vp, /tStatus\('繞X°'/)
  assert.match(vp, /tStatus\('↺歸零'/)
  assert.match(vp, /tStatus\('體積'/)
  assert.doesNotMatch(vp, /tStatus\('移动\/旋转'/)
  assert.doesNotMatch(vp, /tStatus\('绕X°'/)
  assert.equal(vp.includes("'}体积 {fmtVol"), false)
})

test('toast: 網格參數化／重建為 (no SC 网格|参数化|重建为)', () => {
  assert.match(worker, /網格參數化：重建為/)
  assert.doesNotMatch(worker, /网格参数化/)
  assert.doesNotMatch(worker, /重建为/)
  // greppable SC pair from Solid @1.83
  const leak = /网格|参数化|重建为/
  const toastLine = worker.split('\n').find((l) => l.includes('網格參數化') || l.includes('网格参数化'))
  assert.ok(toastLine)
  assert.doesNotMatch(toastLine, leak)
})

test('BD-8303: HistoryPanel confirm via hist.*', () => {
  assert.match(hist, /msg\('hist\.restoreConfirm'/)
  assert.match(hist, /msg\('hist\.deleteConfirm'/)
  assert.match(hist, /msg\('hist\.readFail'/)
  assert.doesNotMatch(hist, /确定还原/)
  assert.doesNotMatch(hist, /删除「/)
  assert.doesNotMatch(hist, /读取失败/)
  assert.match(msg('hist.restoreConfirm', 'zh-HK'), /確定還原/)
  assert.doesNotMatch(msg('hist.restoreConfirm', 'zh-HK'), /确定还原/)
  for (const k of ['hist.restoreConfirm', 'hist.deleteConfirm', 'hist.readFail']) {
    assert.ok(allCatalogKeys().includes(k), k)
  }
})

test('Pins retained', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')
  assert.equal(msg('status.boxCreated', 'ja'), 'ボックスを作成しました {0}×{1}×{2}')
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('ui.browser', 'zh-HK'), '瀏覽器')
})
