/**
 * v1.91: SketchToolPanel leftover SC → TC (TOOL_HINT / mirror / dimension / construction)
 * Continuous improvement after v1.90 BD-8902 four labels.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { catalogKeyCount, LOCALES, tStatus } from '../src/i18n.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const sk = readFileSync(new URL('../src/components/SketchToolPanel.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION 1.91; SW webcad-v1.91', () => {
  assert.match(version, /APP_VERSION = '1\.91'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.91/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

test('BD-9101: TOOL_TITLE / TOOL_HINT TC (no SC leftovers)', () => {
  assert.match(sk, /circle: '圓'/)
  assert.match(sk, /mirror: '鏡像'/)
  assert.match(sk, /cline: '構造參考線'/)
  assert.match(sk, /polyline: '折線'/)
  assert.match(sk, /select: '點 點 \/ 邊 \/ 圓（可多選）/)
  assert.match(sk, /circle: '點圓心 → 點半徑'/)
  assert.match(sk, /dimension: '點 邊=長度 · 圓=Ø/)
  assert.equal(sk.includes("circle: '圆'"), false)
  assert.equal(sk.includes("mirror: '镜像'"), false)
  assert.equal(sk.includes('构造参考线'), false)
  assert.equal(sk.includes('点圆心'), false)
  assert.equal(sk.includes('连续点击'), false)
  assert.equal(sk.includes('两点圆'), false)
})

test('BD-9101: SK_CON_LABEL_ZH + Hint summary TC', () => {
  assert.match(sk, /v: '豎直'/)
  assert.match(sk, /collinear: '共線'/)
  assert.match(sk, /midpoint: '中點'/)
  assert.match(sk, /symmetric: '對稱'/)
  assert.match(sk, /<summary>操作說明<\/summary>/)
  assert.equal(sk.includes("v: '竖直'"), false)
  assert.equal(sk.includes("collinear: '共线'"), false)
  assert.equal(sk.includes('操作说明'), false)
})

test('BD-9101: mirror / dimension / construction-line hints TC', () => {
  assert.match(sk, /T\('點一條直線邊做鏡像軸'\)/)
  assert.match(sk, /T\('┊ 豎直'\)/)
  assert.match(sk, /T\('┋ 中心線（旋轉軸\/對稱參照）'\)/)
  assert.match(sk, /T\('⌒ 弧長尺寸'\)/)
  assert.match(sk, /T\('偏移距離'\)/)
  assert.match(sk, /T\('半徑 R'\)/)
  assert.equal(sk.includes("T('点一条直线边做镜像轴')"), false)
  assert.equal(sk.includes("T('偏移距离')"), false)
  assert.equal(sk.includes('竖直构造线'), false)
  assert.equal(sk.includes('中心线（旋转轴'), false)
  assert.equal(sk.includes('弧长尺寸'), false)
})

test('BD-9101: TOOL_HINT displays go through T()', () => {
  assert.match(sk, /T\(TOOL_HINT\[tool\]/)
  assert.match(sk, /T\(TOOL_HINT\.rrect\)/)
  assert.equal(sk.includes('<Hint>{TOOL_HINT[tool]}</Hint>'), false)
})

test('BD-9101: tStatus zh-HK / zh-CN / en for TOOL_HINT samples', () => {
  const samples = [
    ['點圓心 → 點半徑', /点圆心/, 'Click center → radius point'],
    ['鏡像', /镜像/, 'Mirror'],
    ['構造參考線', /构造参考线/, 'Construction reference'],
    ['豎直', /竖直/, 'Vertical'],
    ['共線', /共线/, 'Collinear'],
    ['操作說明', /操作说明/, 'How to'],
    ['點一條直線邊做鏡像軸', /点一条直线边做镜像轴/, 'Click a straight edge as mirror axis'],
  ]
  for (const [tc, scRe, en] of samples) {
    assert.equal(tStatus(tc, 'zh-HK'), tc)
    assert.match(traditionalToSimplified(tc), scRe)
    assert.equal(tStatus(tc, 'zh-CN'), traditionalToSimplified(tc))
    assert.equal(tStatus(tc, 'en'), en, `EN for ${tc}`)
  }
})

test('BD-9101: STATUS_PHRASES_X v1.91 block present', () => {
  assert.match(i18n, /v1\.91 SketchToolPanel TOOL_HINT/)
  assert.match(i18n, /'點圓心 → 點半徑': 'Click center → radius point'/)
})

test('BD-9101: user-grep SC forms absent from SketchToolPanel UI strings', () => {
  // SC-distinct leftovers from checkpoint grep
  for (const sc of ['选', '构', '镜', '线', '点', '圆', '自动', '点击', '清空', '约束', '竖直', '共线', '镜像', '构造']) {
    // allow in comments? prefer none in file for visible; comments already TC
    assert.equal(sk.includes(sc), false, `SC leftover: ${sc}`)
  }
})
