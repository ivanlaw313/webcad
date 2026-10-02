// BUG-417 / BUG-409：特徵對話框提交閘
// ════════════════════════════════════════════════════════════════════════════
//
// 外部 QA（Grok，v2.15）：
//   · BUG-417 已經出咗錯誤訊息，但「確定」掣仍然撳得（撳咗先驗證）
//   · BUG-409 數值欄靜默換值：陣列數量 NaN→0、拔模角 NaN→0、分割位置 NaN→0…
//
// 跑：node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/featdlg-submit-gate.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FEAT_PARAM_SPEC, featDlgBlockingReason, featParamResults } from '../src/cad/featDlgNumeric.ts'

const dlg = (kind, params, paramRaw) => ({ kind, params, paramRaw })

test('冇 paramRaw 嘅對話框 —— 行為逐字不變（增量兼容嘅前提）', () => {
  assert.equal(featDlgBlockingReason(dlg('pattern', { countX: 3 })), null)
  assert.equal(featDlgBlockingReason(dlg('pattern', { countX: NaN })), null,
    '★ 未遷移嘅欄位唔准突然被新閘擋住 —— 否則一改就打爛幾十個對話框 ★')
  assert.equal(featDlgBlockingReason(null), null)
})

test('★ BUG-417：有非法輸入就一定要阻住提交（確定掣同 commit 共用呢條規則）★', () => {
  for (const raw of ['abc', 'NaN', '1e9', '-3', '0', '2.5']) {
    const r = featDlgBlockingReason(dlg('pattern', { countX: Number(raw) }, { countX: raw }))
    assert.ok(r, `陣列數量「${raw}」應該阻住提交，但攞到 ${JSON.stringify(r)}`)
  }
})

test('合法輸入唔准被阻（唔好過度封鎖）', () => {
  for (const raw of ['1', '3', '400']) {
    assert.equal(featDlgBlockingReason(dlg('pattern', { countX: Number(raw) }, { countX: raw })), null, raw)
  }
})

test('★ 理由一定要夾帶用戶原文 —— 根治「打 1e9 但話必須大於 0」★', () => {
  const r = featDlgBlockingReason(dlg('pattern', { countX: 1e9 }, { countX: '1e9' }))
  assert.ok(r && r.includes('1e9'), `理由要講返用戶打咗乜，實得：${r}`)
  assert.ok(!/必須大於\s*0/.test(r), '1e9 嘅問題係超上限，唔係「必須大於 0」')
})

test('★ 按 kind scope：同一個 param 名喺唔同對話框唔可以用錯 spec ★', () => {
  // 'angle' 喺 draft = 拔模角（−85..85）；喺 circpattern 根本冇登記，唔應該被驗
  assert.equal(featDlgBlockingReason(dlg('draft', { angle: 5 }, { angle: '5' })), null, '5° 合法')
  assert.ok(featDlgBlockingReason(dlg('draft', { angle: 100 }, { angle: '100' })), '100° 超出 ±85')
  assert.equal(featDlgBlockingReason(dlg('circpattern', { angle: 100 }, { angle: '100' })), null,
    'circpattern 嘅 angle 冇登記 spec，唔應該借 draft 嘅規則去驗')
})

test('拔模角 0 合法（= 唔拔模），但 NaN / abc 要拒 —— 唔准靜默變 0', () => {
  assert.equal(featDlgBlockingReason(dlg('draft', { angle: 0 }, { angle: '0' })), null)
  for (const raw of ['abc', 'NaN', '']) {
    const r = featDlgBlockingReason(dlg('draft', { angle: Number(raw) }, { angle: raw }))
    assert.ok(r, `拔模角「${raw}」要拒，實得 ${JSON.stringify(r)}`)
  }
})

test('分割位置可以負、可以 0，但 NaN / abc 要拒', () => {
  for (const raw of ['0', '-5', '12.5']) {
    assert.equal(featDlgBlockingReason(dlg('splitbody', { offset: Number(raw) }, { offset: raw })), null, raw)
  }
  assert.ok(featDlgBlockingReason(dlg('splitbody', { offset: NaN }, { offset: 'abc' })))
})

test('陣列間距 0 要有訊息（QA：間距 0 冇任何提示）', () => {
  assert.ok(featDlgBlockingReason(dlg('pattern', { dx: 0 }, { dx: '0' })), '間距 0 要阻住並講原因')
  assert.equal(featDlgBlockingReason(dlg('pattern', { dx: 20 }, { dx: '20' })), null)
})

test('多個欄位同時非法 → 只報第一個（唔好一次轟一堆）', () => {
  const r = featDlgBlockingReason(dlg('pattern', {}, { countX: 'abc', countY: 'NaN', dx: '0' }))
  assert.ok(r && typeof r === 'string')
  assert.equal(r.split('；').length, 1, '一次講一個，用戶改完一個再講下一個')
})

test('★ REGRESSION：被拒嘅結果唔准帶住一個「代入出嚟」嘅數字 ★', () => {
  // 呢條就係 BUG-409 嘅本質：靜默換值。parse 結果唔 ok 就連 value 都唔准有。
  for (const raw of ['abc', 'NaN', '', '1e9', '-3']) {
    for (const r of featParamResults(dlg('pattern', {}, { countX: raw }))) {
      if (!r.ok) assert.ok(!('value' in r), `「${raw}」被拒但仍然帶住 value —— 就係靜默換值嘅溫床`)
    }
  }
})

test('spec 表本身：登記過嘅 kind/param 冇被靜靜改走', () => {
  assert.deepEqual(Object.keys(FEAT_PARAM_SPEC).sort(), ['circpattern', 'cpattern', 'draft', 'pattern', 'splitbody'])
  assert.equal(FEAT_PARAM_SPEC.pattern.countX, 'patternCount')
  assert.equal(FEAT_PARAM_SPEC.draft.angle, 'draftAngle')
  assert.equal(FEAT_PARAM_SPEC.splitbody.offset, 'splitPosition')
})
