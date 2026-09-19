/**
 * v1.90 BD-8901: fillet radius-group status / labels SC→TC
 * v1.90 BD-8902: SketchToolPanel select/autoconstrain visible SC→TC
 * BOT-D @1.89 leftover: 半径组 1 已激活：之后点选嘅边会加入呢组；棱／半径
 * Checkpoint: 撳空白=清选择 / 自动约束推断 / 一键自动约束 / 画成构造几何
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
const sk = readFileSync(new URL('../src/components/SketchToolPanel.tsx', import.meta.url), 'utf8')

test('APP_VERSION 1.94; SW webcad-v1.94', () => {
  assert.match(version, /APP_VERSION = '1.94'/)
  assert.match(sw, /const CACHE = 'webcad-v1.94/)
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
  assert.equal(vp.includes("'條棱'"), false)
  assert.equal(vp.includes('"條棱"'), false)
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

test('BD-8902: SketchToolPanel four labels TC (no SC leftovers)', () => {
  assert.match(sk, /T\('撳空白 = 清選擇'\)/)
  assert.match(sk, /T\('自動約束推斷'\)/)
  assert.match(sk, /T\('✨ 一鍵自動約束'\)/)
  assert.match(sk, /T\('⚟ 畫成構造幾何（下一筆）'\)/)
  assert.equal(sk.includes("T('撳空白 = 清选择')"), false)
  assert.equal(sk.includes("T('自动约束推断')"), false)
  assert.equal(sk.includes("T('✨ 一键自动约束')"), false)
  assert.equal(sk.includes("T('⚟ 画成构造几何（下一笔）')"), false)
  assert.equal(sk.includes('清选择'), false)
  assert.equal(sk.includes('自动约束推断'), false)
  assert.equal(sk.includes('一键自动约束'), false)
  assert.equal(sk.includes('画成构造几何'), false)
})

test('BD-8902: SketchToolPanel related titles/hints TC', () => {
  assert.match(sk, /T\('開=撳真空白即清選擇（Fusion 默認）；關=撳空唔清（防誤清，ESC 先清）'\)/)
  assert.match(sk, /T\('畫圖時自動加 水平\/豎直\/重合\/平行\/相切… 約束（Fusion AutoConstrain）'\)/)
  assert.match(sk, /T\('對選中集（無選擇=全部幾何）一次推斷多約束'\)/)
  assert.match(sk, /T\('構造線型預切換（Fusion Linetype）：開住時之後畫嘅形即時成構造幾何（琥珀虛線，唔參與拉伸）'\)/)
  assert.match(sk, /T\('點 點\/邊\/圓 揀選（可多選）/)
  assert.equal(sk.includes('无选择'), false)
  assert.equal(sk.includes('Fusion 默认'), false)
})

test('BD-8902: tStatus zh-HK / zh-CN / en for panel labels', () => {
  const labels = [
    '撳空白 = 清選擇',
    '自動約束推斷',
    '✨ 一鍵自動約束',
    '⚟ 畫成構造幾何（下一筆）',
  ]
  for (const tc of labels) {
    assert.equal(tStatus(tc, 'zh-HK'), tc)
    const sc = traditionalToSimplified(tc)
    assert.equal(tStatus(tc, 'zh-CN'), sc)
    assert.notEqual(tStatus(tc, 'en'), tc, `EN missing for ${tc}`)
  }
  assert.match(traditionalToSimplified('撳空白 = 清選擇'), /清选择/)
  assert.match(traditionalToSimplified('自動約束推斷'), /自动约束推断/)
  assert.match(traditionalToSimplified('✨ 一鍵自動約束'), /一键自动约束/)
  assert.match(traditionalToSimplified('⚟ 畫成構造幾何（下一筆）'), /画成构造几何/)
  assert.equal(tStatus('撳空白 = 清選擇', 'en'), 'Click empty = Clear selection')
  assert.equal(tStatus('自動約束推斷', 'en'), 'Auto-constrain inference')
  assert.equal(tStatus('✨ 一鍵自動約束', 'en'), '✨ One-click AutoConstrain')
  assert.equal(tStatus('⚟ 畫成構造幾何（下一筆）', 'en'), '⚟ Draw as construction geometry (next stroke)')
})


test('BD-8901 residual: 選中第 N 組 / no 选中第 / 稜 not 棱 in fillet labels', () => {
  assert.match(vp, /選中第 \{filletActiveGroup \+ 1\} 組/)
  assert.equal(vp.includes('选中第'), false)
  assert.match(vp, /自動連相切稜/)
  assert.equal(vp.includes('自動連相切棱'), false)
  assert.match(vp, /要處理的稜/)
  assert.equal(vp.includes('要處理的棱'), false)
})

test('Pins retained', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.equal(msg('mm.fit', 'zh-HK'), '適應視窗')
  assert.equal(msg('hist.footer', 'zh-HK').includes('清除瀏覽器數據'), true)
})
