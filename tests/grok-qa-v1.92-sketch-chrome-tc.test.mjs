/**
 * v1.93: BD-9201 Viewport sketch chrome / mini-toolbar / plane helper / display-toggle SC→TC
 * Continues v1.91 SketchToolPanel TC; locks 正對／幾何捕捉／基準Z／捕捉關 etc.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { catalogKeyCount, LOCALES, tStatus } from '../src/i18n.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION 1.93; SW webcad-v1.93', () => {
  assert.match(version, /APP_VERSION = '1\.93'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.93/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

test('BD-9201 locale residuals TC in Viewport sketch chrome', () => {
  assert.match(vp, /點圓心再點半徑／打數字定精確Ø/)
  assert.match(vp, /\['cons', '約束'\]/)
  assert.match(vp, /\['points', '點'\]/)
  assert.match(vp, /\['constr', '構造'\]/)
  assert.match(vp, /\['grid', '網格'\]/)
  assert.match(vp, /前=豎直面 XZ/)
  assert.match(vp, /tStatus\('正對', lang\)/)
  assert.match(vp, /tStatus\('🧲 幾何捕捉', lang\)/)
  assert.match(vp, /tStatus\('⊘ 捕捉關', lang\)/)
  assert.match(vp, /tStatus\('基準Z', lang\)/)
  assert.match(vp, /tStatus\('透視', lang\)/)
  assert.match(vp, /tStatus\('✓ 完成線', lang\)/)
  assert.match(vp, /tStatus\('✓ 閉合', lang\)/)
  assert.match(vp, /tStatus\('⛓斷開連結', lang\)/)
  assert.equal(vp.includes('点圆心再点半径／打数字定精确Ø'), false)
  assert.equal(vp.includes("['cons', '约束']"), false)
  assert.equal(vp.includes("['points', '点']"), false)
  assert.equal(vp.includes("['constr', '构造']"), false)
  assert.equal(vp.includes('前=竖直面'), false)
  assert.equal(vp.includes("tStatus('正对', lang)"), false)
  assert.equal(vp.includes("tStatus('⊘ 捕捉关', lang)"), false)
  assert.equal(vp.includes("tStatus('基准Z', lang)"), false)
  assert.equal(vp.includes("tStatus('几何捕捉', lang)"), false)
})

test('BD-9201 SC leftovers absent from sketch chrome chunk', () => {
  const i0 = vp.indexOf('skLookAt()')
  const i1 = vp.indexOf("tStatus('透視'", i0)
  assert.ok(i0 > 0 && i1 > i0, `bounds ${i0} ${i1}`)
  // Strip JSX/block comments so developer notes with SC do not false-fail
  const chunk = vp.slice(i0, i1 + 120).replace(/\/\*[\s\S]*?\*\//g, '')
  const literals = [...chunk.matchAll(/tStatus\(([`'"])([\s\S]*?)\1/g)].map((m) => m[2])
  const lit = literals.join('\n')
  for (const sc of [
    '草图', '约束', '构造', '选择', '拖动', '检验', '竖直', '正对', '逐条',
    '折线', '点圆心', '打数字定精确', '网格', '捕捉关', '基准Z', '几何捕捉',
  ]) {
    assert.equal(lit.includes(sc), false, `SC leftover in tStatus literal: ${sc}`)
  }
  assert.match(chunk, /選擇點／邊／尺寸；拖動檢驗約束/)
  assert.match(chunk, /點位置落構造參考線（工具面板切 豎直/)
  assert.match(chunk, /🧲 幾何捕捉/)
  assert.match(chunk, /⊘ 捕捉關/)
  assert.match(chunk, /基準Z/)
})

test('BD-9201 store sketch-plane status TC', () => {
  assert.match(store, /草圖面：上 \/ XY（水平面）/)
  assert.match(store, /前 \/ XZ（豎直面）— 畫好後拉伸沿 Y 出料/)
  assert.match(store, /已在斜面上建草圖（任意朝向）/)
  assert.match(store, /選擇草圖基準面：點 紅XY/)
  assert.equal(store.includes('草图面：上 / XY（水平面）'), false)
  assert.equal(store.includes('选择草图基准面'), false)
  assert.equal(store.includes('已在斜面上建草图'), false)
})

test('BD-9201 tStatus zh-HK / zh-CN / en samples', () => {
  const samples = [
    ['正對', /正对/, 'Look At'],
    ['🧲 幾何捕捉', /几何捕捉/, 'Geo snap'],
    ['⊘ 捕捉關', /捕捉关/, 'Snap off'],
    ['基準Z', /基准Z/, 'Datum Z'],
    ['透視', /透视/, 'See-through'],
    ['✓ 完成線', /完成线/, 'Finish line'],
    ['✓ 閉合', /闭合/, 'Close'],
    ['⛓斷開連結', /断开连结|断开链接/, 'Break Link'],
    ['約束', /约束/, 'Constraints'],
    ['構造', /构造/, 'Construction'],
    ['網格', /网格/, 'Grid'],
  ]
  for (const [tc, scRe, enPart] of samples) {
    assert.equal(tStatus(tc, 'zh-HK'), tc)
    assert.match(tStatus(tc, 'zh-CN'), scRe)
    assert.ok(tStatus(tc, 'en').includes(enPart) || tStatus(tc, 'en') === enPart, `${tc} → en got ${tStatus(tc, 'en')}`)
  }
  assert.equal(traditionalToSimplified('基準Z'), '基准Z')
  assert.equal(traditionalToSimplified('捕捉關'), '捕捉关')
  assert.ok(i18n.includes('BD-9201') || i18n.includes('v1.93'))
})
