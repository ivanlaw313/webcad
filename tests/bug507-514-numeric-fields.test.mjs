// BUG-507 / BUG-509 / BUG-514：數值欄位家族
// ════════════════════════════════════════════════════════════════════════════
//
// 外部 QA（Grok bot，live v2.16）：
//  · BUG-514 FORM BOX 長度：算式／全角／空白【靜默變 0.1–0.15mm】，確定仍撳得
//  · BUG-507 圓角半徑欄唔係 LenInput：inch 模式打 1/16，type="number" 剝走斜線
//    變成 116 —— 單位標籤仲係寫死「mm」
//  · BUG-509 Box／孔唔收 +／* 算式，確定仍撳得，而且取第一個數（10+5 → 10mm）
//
// 根因都係同一句：`Math.max(0.1, Number(e.target.value) || 0.1)`。
// `||` 喺 NaN 嗰刻靜靜代入一個同用戶輸入完全無關嘅數字。
//
// ⚠ 呢個檔【唔用】new RegExp(`…`) 做 source-scan。第一版我咁寫，template literal
//   把 \| 塌成 |，個 pattern 變成真‧alternation，空分支配中任何字串。呢次方向係
//   「必須唔存在」所以變永遠紅；同一個寫法用喺「必須存在」就會【永遠綠】。
//   所以一律 includes() 固定字串 —— 冇得退化。
//
// 跑：node --experimental-strip-types --test tests/bug507-514-numeric-fields.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLen, toLenInput } from '../src/io/units.ts'

const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const LINES = vp.split(/\r?\n/)
const dimLines = LINES.filter((l) => l.includes('<LenInput') && l.includes('markDim('))

/* ── BUG-514：FORM BOX 三個尺寸欄 ─────────────────────────────────────── */

test('★ BUG-514：FORM BOX 長／寬／高 唔准再有 `Number(...) || 0.1` 靜默代入 ★', () => {
  for (const k of ['length', 'width', 'height']) {
    const bad = k + ': Math.max(0.1, Number(e.target.value) || 0.1)'
    assert.equal(vp.includes(bad), false,
      '★ FORM BOX ' + k + ' 仍然靜默代入 0.1mm —— QA 打算式／全角／空白就係咁變 0.1 ★')
  }
})

test('★ BUG-514：三個尺寸欄要行 LenInput（三態：合法／非法／空白）★', () => {
  for (const [zhLabel, key] of [['長度', 'length'], ['寬度', 'width'], ['高度', 'height']]) {
    const line = LINES.find((l) => l.includes("'" + zhLabel + "'") && l.includes('<LenInput'))
    assert.ok(line, 'FORM BOX ' + zhLabel + ' 仲未換成 LenInput')
    assert.ok(line.includes("onText={markDim('" + key + "')}"),
      zhLabel + ' 要上報非法狀態，否則確定掣閂唔到')
  }
})

test('★ BUG-514：非法／空白之下「確定」要閂 + 要有可見原因 ★', () => {
  const okLine = LINES.find((l) => l.includes('data-testid="form-box-ok"'))
  assert.ok(okLine, '搵唔到 FORM BOX 確定掣')
  assert.ok(okLine.includes('badHint'), '★ 確定掣冇閂 —— QA 就係咁帶住 0.1mm 提交 ★')
  assert.ok(vp.includes('data-testid="form-box-numeric-alert"'), '要有可見嘅拒絕訊息')
})

test('單位標籤唔准寫死 mm（inch 模式會講錯單位）', () => {
  assert.equal(dimLines.length, 3, '應該有三個 FORM BOX 尺寸欄，實得 ' + dimLines.length)
  for (const d of dimLines) {
    assert.ok(d.includes("unit === 'inch' ? 'in' : unit"), '單位標籤寫死：' + d.slice(0, 140))
    assert.equal(d.includes('/> mm<'), false, '仲寫死 mm：' + d.slice(0, 140))
  }
})

/* ── BUG-507：圓角／倒角半徑 ──────────────────────────────────────────── */

test('★ BUG-507：圓角半徑同倒角距離要行 LenInput（inch 1/16 讀成 116）★', () => {
  assert.equal(vp.includes('aria-label="圓角半徑 mm"'), false,
    '★ 圓角半徑仲係 type=number + 寫死 mm ★')
  assert.equal(vp.includes('aria-label="Chamfer distance mm"'), false,
    '★ 倒角距離仲係 type=number —— inch 模式打分數會變整數 ★')
  assert.equal(vp.includes('距離 mm`}'), false, '逐棱半徑欄仲未換（aria-label 寫死 mm）')
})

test('LenInput 真係處理得到 QA 嗰個輸入：inch 1/16', () => {
  const mm = parseLen('1/16', 'inch')
  assert.ok(mm != null && Math.abs(mm - 25.4 / 16) < 1e-9, '1/16 in 應該 = 1.5875mm，實得 ' + mm)
  assert.notEqual(mm, 116, '★ 就係 QA 見到嘅 116 ★')
})

/* ── BUG-509：算式 ────────────────────────────────────────────────────── */

test('★ BUG-509：算式唔准「取第一個數」—— 10+5 係 15，唔係 10 ★', () => {
  assert.equal(parseLen('10+5', 'mm'), 15)
  assert.equal(parseLen('2*25', 'mm'), 50)
  assert.equal(parseLen('(40-4)/2', 'mm'), 18)
})

test('分數唔准被算式搶走（1/2 仲係分數，唔係除法歧義）', () => {
  assert.equal(parseLen('1/2', 'inch'), 12.7)
  assert.ok(Math.abs(parseLen('1 1/2', 'inch') - 38.1) < 1e-9)
  assert.ok(Math.abs(parseLen('1-1/2', 'inch') - 38.1) < 1e-9,
    '"1-1/2" 要當 1½ 吋，唔可以當成 1 減 0.5')
})

test('殘缺算式一律拒 —— 寧願紅都唔好靜靜落刀', () => {
  for (const raw of ['10+', 'abc', '', '   ', '10/0', '12abc', '(10+5', '--5', '1e9']) {
    assert.equal(parseLen(raw, 'mm'), null, '「' + raw + '」應該返 null')
  }
})

/* ── 來回一致（防 BUG-501 類「顯示同模型唔同」）────────────────────── */

test('算式／全角入到之後，顯示值要 round-trip 得返', () => {
  for (const [raw, unit] of [['10+5', 'mm'], ['４０', 'mm'], ['2*25', 'mm'], ['1/16', 'inch']]) {
    const mm = parseLen(raw, unit)
    assert.ok(mm != null, raw)
    const shown = toLenInput(mm, unit)
    const back = parseLen(shown, unit)
    assert.ok(back != null && Math.abs(back - mm) < 1e-6,
      '「' + raw + '」→ ' + mm + 'mm → 顯示「' + shown + '」→ 讀返 ' + back + '（唔對得返就會變 BUG-501）')
  }
})
