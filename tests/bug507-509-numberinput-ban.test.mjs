// BUG-507 / 509 / 514餘下 / 517 / 518 / 521 / 524：type="number" 係病根
// ════════════════════════════════════════════════════════════════════════════
//
// v2.17 QA（Grok）判 BUG-507／509 STILL_OPEN。我第一輪去改 parser —— 改錯層。
// 喺真 Chrome 逐鍵實測 type="number"：
//
//     打 "1/4"      → 欄位 value = "014"   → 落刀 R14      （QA 實測 R14 ✓）
//     打 "3/8"      → "038"                → R38           （QA 實測 R38 ✓）
//     打 "10/0"     → "0100"               → 孔深 100       （QA 實測 100 ✓）
//     打 "2*3"      → "023"                → 23×1          （QA 實測 23×1 ✓）
//     打 "(40-4)/2" → ""                   → 代入預設值
//
// QA 報嘅每一個錯值都由呢一個機制重現。瀏覽器喺 JS 見到之前已經剝走符號，剩低嘅
// 數字係一個【合法但完全唔同】嘅值 —— 用戶睇唔出，所以直接造錯件。
//
// ⚠ source-scan 一律 includes() 固定字串／逐行過濾，唔砌 regex 模板
//   （template literal 會把 \| 塌成 |，變成永遠綠嘅 alternation）。
//
// 跑：node --experimental-strip-types --test tests/bug507-509-numberinput-ban.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { checkBoltCircle } from '../src/cad/boltCircle.ts'

const SRC = new URL('../src/', import.meta.url)
const vp = readFileSync(new URL('components/Viewport.tsx', SRC), 'utf8')
const store = readFileSync(new URL('store.ts', SRC), 'utf8')
const LINES = vp.split('\n').map((l) => l.replace(/\r$/, ''))
const isComment = (l) => /^\s*(\*|\/\/|\/\*)/.test(l)
const CODE = LINES.filter((l) => !isComment(l)).join('\n')

/* ── ratchet：數目只准跌，唔准升 ──────────────────────────────────────── */

function countAll(dir, acc = { n: 0, per: {} }) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const u = new URL(e.name + (e.isDirectory() ? '/' : ''), dir)
    if (e.isDirectory()) countAll(u, acc)
    else if (e.name.endsWith('.tsx')) {
      const c = (readFileSync(u, 'utf8').match(/type="number"/g) ?? []).length
      if (c) { acc.per[e.name] = c; acc.n += c }
    }
  }
  return acc
}

// v2.17 出貨時 374；呢一輪掃到 190（Viewport 316 → 119）。NumInput.tsx 嗰兩個喺註釋裡面。
// ⚠ 唔准為咗令測試綠而升呢個數 —— 升咗就係新開一個「打 1/4 變 R14」嘅欄。
const MAX_NUMBER_INPUTS = 190

test('★ type="number" 總數只准跌 ★', () => {
  const { n, per } = countAll(SRC)
  assert.ok(n <= MAX_NUMBER_INPUTS,
    'type="number" 由 ' + MAX_NUMBER_INPUTS + ' 升到 ' + n +
    ' —— 每一個都係一個「打 1/4 變 R14」嘅欄\n' + JSON.stringify(per, null, 2))
})

/* ── BUG-507：QA 逐個點名嘅半徑／距離欄 ─────────────────────────────── */

test('★ BUG-507：圓角／倒角／面圓角／弦高／按拉 全部唔准係 type=number ★', () => {
  for (const bad of [
    'aria-label="圓角半徑 mm"', 'aria-label="Chamfer distance mm"', 'aria-label="Chamfer second distance mm"',
    'aria-label="末端半徑（變徑）mm"', 'aria-label="面圓角半徑 mm"', 'aria-label="弦高 mm"',
    'aria-label="不對稱圓角偏移 2 mm"', 'aria-label="按拉距離 mm"',
  ]) {
    assert.equal(vp.includes(bad), false, '★ ' + bad + ' 仲係 type=number —— inch 打 1/4 會變 R14 ★')
  }
})

test('★ BUG-507：逐組半徑欄（QA 明確報 1/4→14mm、3/8→38mm）★', () => {
  const g = LINES.filter((l) => l.includes('setFilletGroupRadius'))
  assert.ok(g.length, '搵唔到逐組半徑欄')
  for (const l of g) {
    assert.equal(l.includes('type="number"'), false, '逐組半徑仲係 type=number：' + l.trim().slice(0, 90))
  }
})

/* ── BUG-509：featDlg（= QA 講嘅「時間軸編輯條」）────────────────────── */

test('★ BUG-509：featDlg 數值欄要行 FeatNum，而且連原文一齊傳 ★', () => {
  assert.ok(vp.includes('function FeatNum('), '搵唔到 FeatNum')
  // 釘【意圖】唔釘逐字：解析唔到／超範圍 → 唔准畀個合法數字，但原文 raw 一定要傳返上去
  const fn = vp.slice(vp.indexOf('function FeatNum('), vp.indexOf('function FeatNum(') + 3500)
  assert.ok(fn.includes('NaN : n, raw)') && fn.includes('setFeatParam(k,'),
    '★ 一定要連原文 raw 一齊傳，而且非法要傳 NaN 唔好傳個代入值 ★')
  assert.ok((vp.match(/<FeatNum k="/g) ?? []).length >= 100, '只換咗一部分 featDlg 欄')
})

test('featDlg 輸入欄唔准再淨傳 Number()（<select> 唔算 —— 選項固定，冇得打字）', () => {
  const bad = LINES.filter((l) => l.includes('<input') && l.includes('Number(e.target.value))') && l.includes('setFeatParam('))
  assert.deepEqual(bad.map((l) => l.trim().slice(0, 70)), [])
})

test('★ BUG-509：孔深／拔模角要受驗（QA：10/0→深 100、(40-4)/2→42°）★', () => {
  assert.ok(vp.includes('title="孔深（0／空白＝自動）"'), '孔深仲未換')
  assert.ok(vp.includes('label="拔模角"'), '拔模角仲未換')
})

/* ── BUG-517 / 518 / 524：FORM 原語 ─────────────────────────────────── */

test('★ BUG-517/518：FORM 圓柱／球／平面／Torus／Quadball／Pipe 要有驗證 ★', () => {
  assert.equal(vp.includes('aria-label="FORM Pipe diameter" type="number"'), false,
    '★ Pipe 直徑仲係 type=number —— QA 打 -5 直接搞崩幾何內核（BUG-518）★')
  assert.ok(vp.includes('onInvalid={setPrimBad}'), '原語欄要上報非法狀態')
  assert.ok(vp.includes('data-testid="form-prim-numeric-alert"'), '要有可見拒絕訊息')
  assert.ok(vp.includes('disabled={!!primBadReason}'), '非法時「確定」要閂')
})

test('★ BUG-518：第二道閘 —— 無效尺寸唔准入內核（鍵盤／程式路徑都擋）★', () => {
  assert.ok(vp.includes('const okDim = (v: number) =>'), 'makePrimitive 冇第二道閘')
  assert.equal(CODE.includes('Math.max(1, formL || 1)'), false,
    '★ 仲靜默代入 1 —— 負數／NaN 就係咁溜入內核 ★')
})

test('★ BUG-524：FORM Box 上限要同 Solid Box 一致（1000000 mm）★', () => {
  assert.ok(vp.includes('FORM_DIM_MAX = 1000000'), 'UI 閘冇上限')
  assert.ok(store.includes('FORM_DIM_MAX = 1000000'), 'store 第二道閘冇上限')
})

test('★ BUG-514 餘下：0 / -5 / -0 要被擋（parse 得到唔等於合法）★', () => {
  assert.ok(vp.includes('必須大於 0（你打了'),
    '★ 範圍要喺閘裡面驗 —— 0 同 -5 parse 得到，落到幾何層就畀 Math.max(0.1,…) 夾成 0.1mm ★')
  assert.ok(store.includes('不是有效尺寸（要大於 0 且不超過'), 'store 側冇第二道閘')
})

/* ── BUG-521：孔圈要報真數目 ───────────────────────────────────────── */

test('★ BUG-521：出件外嘅孔唔准計入「已鑽 N 個」★', () => {
  // QA (h)：80×40 件、PCD Ø200 → 全部出界，但舊版 toast 話「已鑽 6 個」而體積冇變
  const cs = []
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; cs.push([40 + 100 * Math.cos(a), 20 + 100 * Math.sin(a)]) }
  const r = checkBoltCircle(cs, 2, { minX: 0, maxX: 80, minY: 0, maxY: 40 })
  assert.equal(r.kept.length, 0, '全部出界')
  assert.equal(r.outside, 6)
  assert.match(r.warning, /件範圍外/)
})

test('★ BUG-521：互相重疊嘅孔只算一個（QA：PCD Ø1 六孔疊成一洞）★', () => {
  const cs = []
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; cs.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)]) }
  const r = checkBoltCircle(cs, 2, { minX: -40, maxX: 40, minY: -40, maxY: 40 })
  assert.equal(r.kept.length, 1, 'Ø4 孔排喺 PCD Ø1 上 → 實際只得一個洞，實得 ' + r.kept.length)
  assert.equal(r.overlapping, 5)
  assert.match(r.warning, /重疊/)
})

test('正常孔圈唔准被誤殺，亦唔准出警告', () => {
  const r = checkBoltCircle([[20, 20], [60, 20], [60, 35], [20, 35]], 2, { minX: 0, maxX: 80, minY: 0, maxY: 40 })
  assert.equal(r.kept.length, 4)
  assert.equal(r.warning, '')
})

test('冇 bbox（未知件範圍）→ 唔准亂篩，只做重疊檢查', () => {
  const r = checkBoltCircle([[1e6, 0], [0, 0]], 2, null)
  assert.equal(r.kept.length, 2, '唔知件幾大就唔好當人出界')
  assert.equal(r.outside, 0)
})

test('★ toast 要講真數目 + 講明同要求差幾多 ★', () => {
  assert.ok(store.includes('const shortfall = n < nRequested'),
    '★ 冇對數 —— QA 就係見到「已鑽 6 個」但實際 0 個 ★')
  assert.ok(store.includes('未鑽孔：'), '全部孔都無效嘅時候要明講，唔好報成功')
})
