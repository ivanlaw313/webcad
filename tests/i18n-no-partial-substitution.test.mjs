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

/** BUG-302: expected zh-HK rendering (simplified residue converted, wording otherwise kept). */
const ZH_HK = {
  [TIMELINE]: TIMELINE,
  [TUBE_TIP]: '\u5713\u7ba1/\u896f\u5957\uff1a\u8a2d\u5916\u5f91\u00d8/\u58c1\u539a/\u9ad8\u5efa\u7a7a\u5fc3\u7ba1\u3002',
  [TUBE_DLG]: '\u5713\u7ba1/\u896f\u5957\uff1a\u8a2d\u5916\u5f91\u00d8/\u58c1\u539a/\u9ad8 \u2192 \u78ba\u5b9a\u3002\u7ba1/\u896f\u5957/\u588a\u74b0/\u9694\u5957\u5e38\u7528\uff08\u6046\u5efa\u65b0\u9ad4\uff0c\u5916\u5713\u62c9\u4f38+\u5167\u5713\u5207\u9664\uff0c\u6642\u9593\u8ef8\u53ef\u6539\uff09\u3002',
  [FOURBAR]: '\u5e73\u9762\u56db\u9023\u687f\u9589\u74b0\u6a5f\u69cb\uff1a\u62d6\u66f2\u67c4\u89d2\u2192\u9023\u687f/\u6416\u687f\u7d04\u675f\u6c42\u89e3\u806f\u52d5\uff08\u687f\u9577\u525b\u6027\uff09\u3002',
}

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
    // BUG-302: zh-HK no longer echoes the source verbatim — it traditionalises the
    // simplified residue (衬/垫/恒/杆/摇) that these store strings still carry.
    assert.equal(tStatus(src, 'zh-HK'), ZH_HK[src])
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
