/**
 * v2.01 BD-2101: CSketch status tips + MultiViewPanes high-exposure tip SC→港繁.
 * APP 2.01 + SW webcad-v2.01.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const cs = readFileSync(new URL('../src/sketch/csketch.ts', import.meta.url), 'utf8')
const mvp = readFileSync(new URL('../src/components/MultiViewPanes.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION 2.01; SW webcad-v2.01', () => {
  assert.match(version, /APP_VERSION = '2\.01'/)
  assert.match(sw, /const CACHE = 'webcad-v2\.01'/)
})

test('csketch setTool / empty / trim tips are 港繁', () => {
  assert.match(cs, /修剪：點線段 → 刪到最近交點（無交點刪整條）/)
  assert.match(cs, /選擇：點實體選取，拖動點可移動（受約束）/)
  assert.match(cs, /點擊落點/)
  assert.match(cs, /繪製/)
  assert.match(cs, /已清空草圖（保留原點 ⊕，可對原點打尺寸定位）/)
  assert.match(cs, /草圖已經係空白/)
  assert.match(cs, /已撤銷（Ctrl\+Y 重做）/)
  assert.match(cs, /修剪：點選要刪除嘅線段（會刪到最近交點；無交點則刪整條）/)
  assert.match(cs, /該端前方無可延伸/)
  assert.match(cs, /打斷/)
  assert.match(cs, /構造線/)
  assert.match(cs, /虛線/)
  assert.match(cs, /不計入/)
  assert.match(cs, /鏡像/)
  assert.match(cs, /陣列/)
  assert.match(cs, /圓心/)
  assert.match(cs, /繞原點/)
  assert.match(cs, /無法定義/)
  assert.match(cs, /選擇組合/)
  assert.match(cs, /選咗/)
})

test('csketch status tips: key SC forms absent', () => {
  assert.doesNotMatch(cs, /点击落点/)
  assert.doesNotMatch(cs, /已清空草图/)
  assert.doesNotMatch(cs, /点选要删除/)
  assert.doesNotMatch(cs, /绘制 /)
  assert.doesNotMatch(cs, /选择：点实体/)
  assert.doesNotMatch(cs, /已撤销（/)
  assert.doesNotMatch(cs, /构造线（参考/)
  assert.doesNotMatch(cs, /虚线显示/)
  assert.doesNotMatch(cs, /不计入轮廓/)
  assert.doesNotMatch(cs, /无法定义距离/)
  assert.doesNotMatch(cs, /选咗/)
  assert.doesNotMatch(cs, /绕原点/)
})

test('MultiViewPanes TC tip; SC absent', () => {
  assert.match(mvp, /此窗格暫無實體 — 請在「單一視圖」建模後再切回二／四視圖預覽/)
  assert.match(mvp, /二視圖 · 預覽／環視/)
  assert.match(mvp, /四視圖 · 預覽／環視/)
  assert.doesNotMatch(mvp, /暂无实体/)
  assert.doesNotMatch(mvp, /单一视图/)
  assert.doesNotMatch(mvp, /二视图/)
  assert.doesNotMatch(mvp, /预览／环视/)
})

test('i18n has TC + legacy SC MultiView keys', () => {
  assert.match(i18n, /此窗格暫無實體 — 請在「單一視圖」建模後再切回二／四視圖預覽/)
  assert.match(i18n, /此窗格暂无实体 — 请在「单一视图」建模后再切回二／四视图预览/)
  assert.match(i18n, /v2\.01 BD-2101/)
  assert.match(i18n, /修剪：點線段 → 刪到最近交點/)
})
