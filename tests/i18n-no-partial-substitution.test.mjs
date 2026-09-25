/**
 * v2.03: EN tStatus must not splice single glossary words into a Chinese sentence.
 * Whole-string / whole-word matches still translate. Anything else stays source Chinese.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { tStatus } from '../src/i18n.ts'

const TIMELINE = '參數化時間軸 — 建模後特徵出現在這裏，點擊任意節點可改參數並自動重建'
const TUBE_TIP = '圓管/衬套：設外徑Ø/壁厚/高建空心管。'
const TUBE_DLG = '圓管/衬套：設外徑Ø/壁厚/高 → 確定。管/衬套/垫環/隔套常用（恒建新體，外圓拉伸+內圓切除，時間軸可改）。'
const FOURBAR = '平面四連杆閉環機構：拖曲柄角→連杆/摇杆約束求解聯動（杆長剛性）。'

const CJK = /[\u4e00-\u9fff]/
const GARBAGE = /Axis|Points|Circle管|plane四|Autorebuild|feature出現|時間timeline|Points擊|節Points/

test('glossary words translate only when the whole string is that word', () => {
  assert.equal(tStatus('圓', 'en'), 'Circle')
  assert.equal(tStatus('點', 'en'), 'Points')
  assert.equal(tStatus('軸', 'en'), 'Axis')
  assert.equal(tStatus('平面', 'en'), 'plane')
  assert.equal(tStatus('時間軸', 'en'), 'timeline')
  assert.equal(tStatus('特徵', 'en'), 'feature')
  assert.equal(tStatus('自動', 'en'), 'Auto')
  assert.equal(tStatus('重建', 'en'), 'rebuild')
})

test('single-character and short glosses are not applied inside a Chinese sentence', () => {
  const src = '未收錄：參數化時間軸上的節點、圓管平面同自動重建'
  assert.equal(tStatus(src, 'en'), src)
  assert.doesNotMatch(tStatus(src, 'en'), GARBAGE)
  assert.match(tStatus(src, 'en'), CJK)

  assert.equal(tStatus('參數化時間軸', 'en'), '參數化時間軸')
  assert.equal(tStatus('圓管/衬套', 'en'), '圓管/衬套')
  assert.equal(tStatus('平面四連杆', 'en'), '平面四連杆')
  assert.equal(tStatus('點擊任意節點', 'en'), '點擊任意節點')
  assert.equal(tStatus('自動重建', 'en'), '自動重建')
  assert.doesNotMatch(tStatus('點擊任意節點', 'en'), /Points/)
  assert.doesNotMatch(tStatus('圓管/衬套', 'en'), /Circle/)
  assert.doesNotMatch(tStatus('平面四連杆', 'en'), /plane/)
  assert.doesNotMatch(tStatus('參數化時間軸', 'en'), /Axis|timeline/)
})

test('timeline, tube/bushing, and four-bar hints are complete English sentences', () => {
  for (const src of [TIMELINE, TUBE_TIP, TUBE_DLG, FOURBAR]) {
    const en = tStatus(src, 'en')
    assert.notEqual(en, src)
    assert.doesNotMatch(en, CJK)
    assert.doesNotMatch(en, GARBAGE)
    assert.equal(tStatus(src, 'zh-HK'), src)
  }
  assert.match(tStatus(TIMELINE, 'en'), /Parametric timeline/)
  assert.match(tStatus(TIMELINE, 'en'), /rebuild automatically/)
  assert.match(tStatus(TUBE_TIP, 'en'), /Tube \/ bushing/)
  assert.match(tStatus(TUBE_TIP, 'en'), /hollow tube/)
  assert.match(tStatus(TUBE_DLG, 'en'), /bushing/)
  assert.match(tStatus(FOURBAR, 'en'), /four-bar linkage/)
  assert.match(tStatus(FOURBAR, 'en'), /crank angle/)
})

test('zh-CN simplifies the timeline hint and does not inject English tokens', () => {
  const cn = tStatus(TIMELINE, 'zh-CN')
  assert.match(cn, /参数化时间轴/)
  assert.match(cn, /自动重建/)
  assert.doesNotMatch(cn, /Axis|Points|Circle|plane|timeline|feature|Auto/)
})
