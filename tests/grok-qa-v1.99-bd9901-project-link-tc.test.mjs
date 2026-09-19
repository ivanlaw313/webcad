/**
 * v1.99 BD-9901: project-link dialog + viewport/browser high-exposure SC→港繁.
 * APP 1.99 + SW webcad-v1.99.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const pls = readFileSync(new URL('../src/components/ProjectionLinkStatus.tsx', import.meta.url), 'utf8')
const pl = readFileSync(new URL('../src/sketch/projectLinks.ts', import.meta.url), 'utf8')
const fvm = readFileSync(new URL('../src/components/FloatingViewMenu.tsx', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const bt = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('APP_VERSION 1.99; SW webcad-v1.99', () => {
  assert.match(version, /APP_VERSION = '1\.99'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.99/)
})

test('ProjectionLinkStatus TC strings; no key SC forms', () => {
  assert.match(pls, /投影關聯狀態/)
  assert.match(pls, /投影需要處理/)
  assert.match(pls, /選擇輪廓/)
  assert.match(pls, /重新連結/)
  assert.match(pls, /斷開連結/)
  assert.match(pls, /正在核對約束/)
  assert.match(pls, /確認重新連結/)
  assert.match(pls, /替換來源/)
  assert.match(pls, /不相容/)
  assert.doesNotMatch(pls, /投影关联状态/)
  assert.doesNotMatch(pls, /选择轮廓/)
  assert.doesNotMatch(pls, /重新连结/)
  assert.doesNotMatch(pls, /断开连结/)
  assert.doesNotMatch(pls, /正在核对/)
})

test('projectLinks projectLinkIssueText TC', () => {
  assert.match(pl, /投影來源不可用/)
  assert.match(pl, /來源改變，現有約束需要重新核對/)
  assert.match(pl, /關聯曲線已被修改/)
  assert.doesNotMatch(pl, /投影来源不可用/)
  assert.doesNotMatch(pl, /关联曲线已被修改/)
})

test('FloatingViewMenu 顯示方式', () => {
  assert.match(fvm, /aria-label="顯示方式"/)
  assert.doesNotMatch(fvm, /aria-label="显示方式"/)
})

test('Viewport 文檔單位 / 顯示方式 / 僅影響屏上讀數', () => {
  assert.match(vp, /文檔單位/)
  assert.match(vp, /B-rep 顯示方式/)
  assert.match(vp, /僅影響屏上讀數/)
  assert.match(vp, /應用偏好：主題 \/ 預設單位 \/ 自動正視草圖/)
  assert.doesNotMatch(vp, /文档单位/)
  assert.doesNotMatch(vp, /B-rep 显示方式/)
  assert.doesNotMatch(vp, /仅影响屏上读数/)
})

test('BrowserTree 重建失敗', () => {
  assert.match(bt, /重建失敗：/)
  assert.doesNotMatch(bt, /重建失败：/)
  assert.match(bt, /模組複用/)
  assert.match(bt, /組內關節/)
  assert.match(bt, /質心/)
})

test('store project-relink status TC', () => {
  assert.match(store, /重新選擇來源/)
  assert.match(store, /無法重新連結/)
  assert.match(store, /已重新連結所選投影曲線/)
  assert.doesNotMatch(store, /重新选择来源/)
  assert.doesNotMatch(store, /无法重新连结/)
})
