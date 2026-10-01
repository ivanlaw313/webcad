import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseNumericField,
  parseField,
  numericValueOrNull,
  isSubmittable,
  shouldShowError,
  allSubmittable,
  firstBlockingReason,
  summarizeNumericFields,
  numericRejectStatus,
  NUMERIC_FIELDS,
} from '../src/cad/numericInput.ts'

// ──────────────────────────────────────────────────────────────────────────
// BUG-409：9 條 QA bug 同一個病根 —— `Number(e.target.value) || 預設值`。
// 政策鐵律：任何輸入都唔可以令函數返「一個同用戶輸入無關嘅數字」。
// ──────────────────────────────────────────────────────────────────────────

/** 一個被拒嘅結果，絕對唔准帶住任何數字值。 */
const assertNoSubstitutedNumber = (r, label) => {
  assert.equal(r.ok, false, `${label}：應該被拒`)
  assert.equal('value' in r, false, `${label}：被拒嘅結果唔准帶 value（舊 bug 就係靜默代入預設）`)
  assert.equal(typeof r.reason, 'string')
  assert.ok(r.reason.length > 0, `${label}：一定要講原因`)
}

test('QA 表 1：SOLID Box 長度 1e9 / abc / 空 —— 唔准靜默變返 80', () => {
  const big = parseField('boxLength', '1e9')
  assertNoSubstitutedNumber(big, 'boxLength 1e9')
  assert.equal(big.state, 'invalid')
  // 訊息要講真原因（超上限），唔好再講「必須大於 0」。
  assert.ok(big.reason.includes('最大'), big.reason)
  assert.ok(big.reason.includes('1e9'), big.reason)
  assert.equal(big.reason.includes('必須大於 0'), false, '1e9 唔係「必須大於 0」—— 理由錯過冇理由')

  const abc = parseField('boxLength', 'abc')
  assertNoSubstitutedNumber(abc, 'boxLength abc')
  assert.equal(abc.state, 'invalid')
  assert.ok(abc.reason.includes('唔係數字'), abc.reason)
  assert.ok(abc.reason.includes('abc'), abc.reason)

  const empty = parseField('boxLength', '')
  assertNoSubstitutedNumber(empty, 'boxLength 空')
  assert.equal(empty.state, 'blank', '空白 = 未輸入，唔算打錯但唔可以提交')
  assert.equal(isSubmittable(empty), false)
  assert.equal(shouldShowError(empty), false, '空白唔好即刻紅')

  // 0 / -5 照舊要拒，但理由講得準。
  const zero = parseField('boxLength', '0')
  assertNoSubstitutedNumber(zero, 'boxLength 0')
  assert.ok(zero.reason.includes('必須大於 0'), zero.reason)
})

test('QA 表 2：長方體闊 1e9 / NaN —— 唔准靜默變 60，確定掣要停用', () => {
  for (const raw of ['1e9', 'NaN']) {
    const r = parseField('boxWidth', raw)
    assertNoSubstitutedNumber(r, `boxWidth ${raw}`)
    assert.equal(isSubmittable(r), false, `${raw}：確定掣一定要停用（舊 bug 真係建出 50×60×30）`)
  }
  // 三欄一齊：有一欄壞就全組唔可以提交。
  const fields = [
    parseField('boxLength', '50'),
    parseField('boxWidth', 'NaN'),
    parseField('boxHeight', '30'),
  ]
  assert.equal(allSubmittable(fields), false)
  assert.ok(firstBlockingReason(fields).includes('寬度'))
})

test('QA 表 3：孔徑 1e9 / NaN —— 唔准靜默變 1，訊息唔准再寫「孔徑必須大於 0」', () => {
  const big = parseField('holeDiameter', '1e9')
  assertNoSubstitutedNumber(big, 'holeDiameter 1e9')
  assert.equal(big.reason.includes('必須大於 0'), false, '1e9 嘅真原因係超上限，唔係「必須大於 0」')
  assert.ok(big.reason.includes('孔徑Ø'), big.reason)

  const nan = parseField('holeDiameter', 'NaN')
  assertNoSubstitutedNumber(nan, 'holeDiameter NaN')
  assert.equal(numericValueOrNull('NaN', NUMERIC_FIELDS.holeDiameter), null, '唔准返 1')
})

test('QA 表 4：孔深 0 —— 唔准靜默變 67.5，-5 要講真原因', () => {
  const zero = parseField('holeDepth', '0')
  assertNoSubstitutedNumber(zero, 'holeDepth 0')
  assert.ok(zero.reason.includes('必須大於 0'), zero.reason)
  assert.equal(numericValueOrNull('0', NUMERIC_FIELDS.holeDepth), null, '唔准返 67.5')

  const neg = parseField('holeDepth', '-5')
  assertNoSubstitutedNumber(neg, 'holeDepth -5')
  assert.ok(neg.reason.includes('-5'), neg.reason)
})

test('QA 表 5：圓角 R -2 → 唔准靜默變 0；0 嘅理由唔准係「半徑太大」', () => {
  const neg = parseField('filletRadius', '-2')
  assertNoSubstitutedNumber(neg, 'filletRadius -2')
  assert.ok(neg.reason.includes('必須大於 0'), neg.reason)
  assert.ok(neg.reason.includes('-2'), neg.reason)

  const zero = parseField('filletRadius', '0')
  assertNoSubstitutedNumber(zero, 'filletRadius 0')
  assert.equal(zero.reason.includes('太大'), false, '輸入 0 顯示「半徑太大」= 理由完全錯')
  assert.ok(zero.reason.includes('必須大於 0'), zero.reason)
})

test('QA 表 6：矩形陣列數量 0 / -3 / 2.5 / NaN 全部要拒；間距 0 要有訊息', () => {
  for (const raw of ['0', '-3', 'NaN', '']) {
    const r = parseField('patternCount', raw)
    assertNoSubstitutedNumber(r, `patternCount ${raw}`)
    assert.equal(isSubmittable(r), false)
  }
  const frac = parseField('patternCount', '2.5')
  assertNoSubstitutedNumber(frac, 'patternCount 2.5')
  assert.ok(frac.reason.includes('整數'), frac.reason)
  assert.equal(numericValueOrNull('2.5', NUMERIC_FIELDS.patternCount), null, '唔准靜默 round 成 2 或 3')

  const spacing = parseField('patternSpacing', '0')
  assertNoSubstitutedNumber(spacing, 'patternSpacing 0')
  assert.ok(spacing.reason.includes('陣列間距'), spacing.reason)
})

test('QA 表 7：拔模角 NaN / abc —— 唔准靜默變 0，確定掣要停用', () => {
  for (const raw of ['NaN', 'abc']) {
    const r = parseField('draftAngle', raw)
    assertNoSubstitutedNumber(r, `draftAngle ${raw}`)
    assert.equal(isSubmittable(r), false)
  }
  // 0 對拔模角係合法（= 唔拔模），要分得清「合法 0」同「非法輸入」。
  const zero = parseField('draftAngle', '0')
  assert.equal(zero.ok, true)
  assert.equal(zero.value, 0)
})

test('QA 表 8：分割位置 NaN / abc —— 唔准靜默變 0；0 / -5 本身合法要照收', () => {
  for (const raw of ['NaN', 'abc']) {
    const r = parseField('splitPosition', raw)
    assertNoSubstitutedNumber(r, `splitPosition ${raw}`)
  }
  assert.deepEqual(
    ['0', '-5'].map((raw) => parseField('splitPosition', raw).value),
    [0, -5],
    '分割位置可以 0 / 負數 —— 合法就要原值通過',
  )
})

test('合法輸入永遠原值通過，唔會改寫（保住用戶打咗嘅字）', () => {
  const r = parseField('boxLength', '12.50')
  assert.equal(r.ok, true)
  assert.equal(r.value, 12.5)
  assert.equal(r.raw, '12.50', 'raw 要原字保住，UI 唔好即刻改走用戶打嘅字')
})

test('三態分得清：valid / invalid / blank', () => {
  assert.equal(parseField('boxLength', '10').state, 'valid')
  assert.equal(parseField('boxLength', 'abc').state, 'invalid')
  assert.equal(parseField('boxLength', '   ').state, 'blank')
  assert.equal(parseField('boxLength', null).state, 'blank')
  assert.equal(parseField('boxLength', undefined).state, 'blank')

  const sum = summarizeNumericFields([parseField('boxLength', '10'), parseField('boxWidth', '')])
  assert.equal(sum.ok, false)
  assert.equal(sum.state, 'blank')
  assert.ok(sum.reason.includes('未輸入'))
})

test('reject status 帶住「尺寸已拒絕」marker，但 detail 係真原因', () => {
  const r = parseField('boxLength', '1e9')
  const status = numericRejectStatus(r)
  assert.ok(status.includes('尺寸已拒絕'), status)
  assert.ok(status.includes('1e9'), status)
})

// ──────────────────────────────────────────────────────────────────────────
// ★ 釘死成個 bug 家族嘅 regression ★
// ──────────────────────────────────────────────────────────────────────────

test('REGRESSION BUG-409：任何輸入都唔可以令函數返「一個同用戶輸入無關嘅數字」', () => {
  const hostile = [
    '', ' ', '   ', 'abc', 'NaN', 'nan', 'Infinity', '-Infinity', 'null', 'undefined',
    'true', '0x10', '1,000', '12mm', '1e9', '-1e9', '1e999', '--5', '1.2.3', '+', '-', '.',
    'e5', '1e', '٣', '１２', '\n5\n', '5 5', '0b11', '1_000',
    null, undefined, NaN, Infinity, -Infinity, {}, [], [1], () => 1, true, false, Symbol.iterator && '',
  ]

  for (const [key, spec] of Object.entries(NUMERIC_FIELDS)) {
    for (const raw of hostile) {
      let r
      try { r = parseNumericField(raw, spec) }
      catch (err) { assert.fail(`${key} / ${String(raw)}：唔准 throw（${err?.message}）`) }

      if (r.ok) {
        // 合法嘅話，value 一定要**真係由用戶輸入推出嚟**：Number(raw.trim()) 要等於佢。
        const back = Number(String(raw).trim())
        assert.equal(r.value, back, `${key} / ${String(raw)}：ok 嘅 value 必須 = 用戶輸入本身`)
        assert.ok(Number.isFinite(r.value))
      } else {
        // 被拒 → 一個數字都唔准返。
        assert.equal('value' in r, false, `${key} / ${String(raw)}：被拒竟然帶 value = 靜默代入預設`)
        assert.equal(typeof r.reason, 'string')
        assert.ok(r.reason.length > 0, `${key} / ${String(raw)}：冇原因`)
        // numericValueOrNull 亦唔准變出數字。
        assert.equal(numericValueOrNull(raw, spec), null, `${key} / ${String(raw)}：numericValueOrNull 唔准返數字`)
      }
    }
  }
})

test('REGRESSION：超範圍唔准靜默夾（Math.max/min 嘅舊行為）', () => {
  const spec = { label: '測試', min: 1, max: 400, integer: true }
  const over = parseNumericField('1000', spec)
  assert.equal(over.ok, false)
  assert.equal('value' in over, false, '唔准夾成 400')
  assert.ok(over.reason.includes('400') && over.reason.includes('1000'), over.reason)

  const under = parseNumericField('0', spec)
  assert.equal(under.ok, false)
  assert.equal('value' in under, false, '唔准夾成 1')
  assert.ok(under.reason.includes('1'), under.reason)
})

test('REGRESSION：訊息一定要含用戶原文，所以理由冇可能同輸入唔符', () => {
  for (const raw of ['1e9', 'abc', '-2', '0', '2.5', '999999999']) {
    for (const spec of Object.values(NUMERIC_FIELDS)) {
      const r = parseNumericField(raw, spec)
      if (!r.ok) assert.ok(r.reason.includes(raw), `${spec.label} / ${raw}：訊息冇講用戶打咗乜 → ${r.reason}`)
    }
  }
})
