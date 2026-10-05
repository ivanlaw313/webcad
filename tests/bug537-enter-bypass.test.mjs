// BUG-529/533/537/538/541/542：確定掣灰咗，但 Enter 照樣提交
// ════════════════════════════════════════════════════════════════════════════
//
// v2.18 QA（Grok）一次過報咗 6 條同一個病：
//   「FORM Box 確定已灰，但喺欄內撳 Enter 照樣建件（靜靜用返上一個合法值）」
//   「長打 1e9+1 再撳 Enter，建出 1 mm 長嘅件」
//   「圓角半徑打 abc：紅框但確定／Enter 仍可提交 → 用上一個有效值 R15 建立」
//
// 我喺本機逐步實測重現：FORM Box 打 1e9+1 →
//   okDisabled = true ✓、紅字 = 「尺寸已拒絕：…」✓，但撳 Enter →「Form Box 已建立」✗
//
// 根因兩層：
//   1. App.tsx 有個【全域 Enter 捷徑】直接 call commitFormBoxDraft()，完全繞過對話框個閘
//   2. 設計上非法就唔寫入 model（啱嘅），所以 model 仲係上一個合法值 —— 提交就靜靜用咗佢
//
// ★ 教訓 ★ 正確性唔可以淨係放喺 UI 閘。只要有第二條入口（鍵盤捷徑、程式、AI 助手），
//   UI 閘就形同虛設。所以：欄自己登記非法 → 掣／Enter／commit 三邊查同一個 map。
//
// 跑：node --experimental-strip-types --test tests/bug537-enter-bypass.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = new URL('../src/', import.meta.url)
const vp = readFileSync(new URL('components/Viewport.tsx', SRC), 'utf8')
const store = readFileSync(new URL('store.ts', SRC), 'utf8')
const numInput = readFileSync(new URL('components/NumInput.tsx', SRC), 'utf8')
const timeline = readFileSync(new URL('components/Timeline.tsx', SRC), 'utf8')
// 只數真 code —— 註釋入面會引用舊寫法做對照（上一輪就係咁誤報過）
const timelineCode = timeline.replace(/[/][*][\s\S]*?[*][/]/g, '')   // 剝走註釋：裡面會引用舊寫法做對照
const VPL = vp.split('\n').map((l) => l.replace(/\r$/, ''))

/* ── 單一真相 ──────────────────────────────────────────────────────────── */

test('★ store 要有「邊個欄而家非法」嘅單一真相 ★', () => {
  assert.ok(store.includes('numericInvalid'), '冇登記表')
  assert.ok(store.includes('reportNumericInvalid'), '冇登記 action')
})

test('★ 欄自己登記 —— 唔可以再靠每個對話框記得查 ★', () => {
  // 上一輪就係逐個接，結果漏咗一半（圓角／孔／拔模／拉伸全部冇接）
  const lenInputBlock = vp.slice(vp.indexOf('function LenInput('), vp.indexOf('function LenInput(') + 4000)
  assert.ok(lenInputBlock.includes('reportNumericInvalid'), 'LenInput 冇自己登記')
  const featNumBlock = vp.slice(vp.indexOf('function FeatNum('), vp.indexOf('function FeatNum(') + 3000)
  assert.ok(featNumBlock.includes('reportNumericInvalid'), 'FeatNum 冇自己登記')
  assert.ok(numInput.includes('reportNumericInvalid'), 'NumInput 冇自己登記')
})

test('★ 每個「確定」掣都要查同一個真相（唔准逐個手接）★', () => {
  const gates = VPL.filter((l) => l.includes('okDisabled={'))
  assert.ok(gates.length >= 10, '搵唔到足夠對話框，實得 ' + gates.length)
  const missing = gates.filter((l) => !l.includes('numBad'))
  assert.deepEqual(missing.map((l) => l.trim().slice(0, 70)), [],
    '★ 呢啲對話框冇查非法登記 —— 打 abc 之後確定仲撳得 ★')
})

/* ── commit 側（唔繞得過嘅一道）────────────────────────────────────── */

test('★ commit 自己要查 —— 全域 Enter 捷徑繞得過 UI 閘 ★', () => {
  assert.ok(store.includes('function pendingNumericIssue()'), '冇 commit 側守衛')
  // FORM Box：App.tsx 個 Enter 捷徑直接 call 佢
  const fb = store.slice(store.indexOf('commitFormBoxDraft: async'), store.indexOf('commitFormBoxDraft: async') + 2000)
  assert.ok(fb.includes('pendingNumericIssue()'),
    '★ commitFormBoxDraft 冇查 —— 實測就係喺呢度畀 Enter 繞過 ★')
  const fd = store.slice(store.indexOf('commitFeatDlg: async'), store.indexOf('commitFeatDlg: async') + 1200)
  assert.ok(fd.includes('pendingNumericIssue()'), 'commitFeatDlg 冇查')
})

/* ── BUG-540/541：上限 ──────────────────────────────────────────────── */

test('★ BUG-540/541：長度欄要有上限（1e9 建出 1000000001 mm 嘅件）★', () => {
  assert.ok(vp.includes('const overMax = max != null'), 'LenInput 冇上限檢查')
  assert.ok(vp.includes('超出上限 ${max} mm'), '超上限要講原因')
  // 超上限唔准寫入 model（否則「確定」閂住但 model 已經污染）
  assert.ok(vp.includes('!(max != null && v > max)') && vp.includes('onMm(v)'),
    '超上限仲寫入 model —— 之後任何提交路徑都會用到嗰個污染值')
  assert.ok((vp.match(/max=\{1000000\}/g) ?? []).length >= 8,
    '圓角／孔 Ø／孔深／抽殼／拉伸 等要加上限，實得 ' + (vp.match(/max=\{1000000\}/g) ?? []).length)
})

/* ── BUG-543 / 507-tlbar：仲有欄未換 ──────────────────────────────── */

test('★ BUG-543：抽殼壁厚唔准仲係 type=number（逐鍵打 -5 變 05 建出壁厚 5）★', () => {
  const shell = VPL.filter((l) => l.includes('shellThickness') && l.includes('<'))
  assert.ok(shell.length, '搵唔到抽殼壁厚欄')
  for (const l of shell) assert.equal(l.includes('type="number"'), false, l.trim().slice(0, 90))
})

test('★ BUG-507-tlbar：時間軸編輯條唔准係 type=number，而且要跟文檔單位 ★', () => {
  assert.equal(timelineCode.includes('type="number"'), false,
    '★ 時間軸編輯條仲係 type=number —— 打「1 1/2」變「112」靜默落刀 ★')
  assert.ok(timeline.includes('parseLen(buf, unit)'), '要同對話框行同一條解析')
  assert.ok(timeline.includes('toLenInput(value, unit)'), '顯示要跟文檔單位')
})

test('★ BUG-507-tlbar：特徵對話框嘅 mm 標籤要跟單位 ★', () => {
  const hard = VPL.filter((l) => l.includes('<FeatNum') && l.includes('/> mm'))
  assert.deepEqual(hard.map((l) => l.trim().slice(0, 70)), [],
    '★ 標籤寫死 mm 但個數係 in —— 畫面數字 ≠ 實際結果 ★')
})

/* ── 我自己新加 UI 嘅回歸（BUG-530/531/534/535/536/539）─────────── */

test('★ BUG-531/539：拒絕訊息唔准顯示內部英文欄名 ★', () => {
  for (const k of ["markDim('length')", "markDim('width')", "markDim('height')"]) {
    assert.equal(vp.includes(k), false, '★ ' + k + ' 會令紅字寫住英文 length ★')
  }
  assert.ok(vp.includes("markDim('長度')"), '要用中文欄名')
})

test('★ BUG-530/539：重開對話框要清走上次嘅紅字 ★', () => {
  assert.ok(vp.includes('setBadDims({}); setPrimBadReason(\'\')'),
    '★ QA 見到重開之後欄位已經係預設值，但紅字仲寫住上一次嘅錯誤 ★')
})

test('★ BUG-534：橫額文案唔准夾簡體，括號唔准疊到唔對稱 ★', () => {
  const svc = readFileSync(new URL('cad/cadService.ts', SRC), 'utf8')
  assert.equal(svc.includes('无响应'), false, '★ 簡體「无响应」會喺橫額上面出街 ★')
  assert.equal(svc.includes('幾何內核崩潰（${why}）'), false,
    '★ why 入面已經有括號，再包一重就變「崩潰（超時（30 秒）），」唔對稱 ★')
})

test('★ BUG-535：撳「新建」要清走崩潰橫額 ★', () => {
  const reset = store.slice(store.indexOf('reset: async () => {'), store.indexOf('reset: async () => {') + 1500)
  assert.ok(reset.includes('kernelNotice: null'),
    '★ QA 實測載入崩潰之後撳新建，紅色「打開未完成」橫額仲留住 ★')
})

test('★ BUG-536：載入只重建到一部分 → 要自動彈恢復清單 ★', () => {
  const i = store.indexOf('打開未完成')
  assert.ok(i > 0)
  const blk = store.slice(i - 600, i + 900)
  assert.ok(blk.includes('listRecoverableAutosaves'),
    '★ 呢條路徑冇彈恢復清單 —— 崩潰嗰刻 UI 仲係空，所以對數對唔到 ★')
})

/* ── v2.19 QA 回報（我自己造成嘅崩潰 + min 從未驗證）───────────────────── */

test('★ BUG-560（我造成嘅 P1）：登記 effect 嘅 deps 唔准放物件 ★', () => {
  // React #185「Maximum update depth exceeded」—— NumInput 個 deps 放咗 parseNumericField
  // 嘅結果物件，identity 次次唔同 → effect 次次跑 → set → re-render → 無限迴圈，
  // 直接搞到「3D 視口」面板崩潰，而且擋住 QA 大量測試（BUG-517-BLOCKED）。
  const ni = readFileSync(new URL('components/NumInput.tsx', SRC), 'utf8')
  assert.equal(/\}, \[gateId, bad, r, reportNumericInvalid\]\)/.test(ni), false,
    '★ deps 放返個物件 —— 無限 re-render ★')
  assert.ok(ni.includes('const invalidReason ='), 'deps 要用【原始值】（字串）')
  // 除名要獨立 unmount effect，唔好同 report 擺埋（否則每個 keystroke 清一次設一次）
  assert.ok(ni.includes('useEffect(() => () => reportNumericInvalid(gateId, null)'),
    '除名要擺喺獨立嘅 unmount effect')
})

test('★ BUG-560 第二道：store 冇變就唔准 call set ★', () => {
  const blk = store.slice(store.indexOf('reportNumericInvalid: (id, reason)'),
    store.indexOf('reportNumericInvalid: (id, reason)') + 900)
  assert.equal(blk.includes('set((st) =>'), false,
    '★ zustand set({}) 一樣會通知 subscriber —— 配埋寫錯 deps 就轆到崩潰 ★')
  assert.ok(blk.includes('if (cur === reason) return'), '冇變就直接 return，唔好入 set')
})

test('★ BUG-551/552/561/514：min 一直宣告咗但從來冇驗證 ★', () => {
  const li = vp.slice(vp.indexOf('function LenInput('), vp.indexOf('function LenInput(') + 4500)
  assert.ok(li.includes('const underMin = min != null'),
    '★ 抽殼壁厚打 -5 建出壁厚 5、孔深打 -5 變自動深度 —— 全部因為 min 冇驗 ★')
  assert.ok(li.includes('最小 ${min} mm'), '要講返最小值同用戶原文')
  assert.ok(li.includes('!(min != null && v < min)'), '低過 min 唔准寫入 model')
  // FeatNum 一樣要有
  const fn = vp.slice(vp.indexOf('function FeatNum('), vp.indexOf('function FeatNum(') + 3500)
  assert.ok(fn.includes('const outRange ='), 'FeatNum 冇範圍檢查')
})

test('★ BUG-549：拉伸距離要喺【求值嗰度】封頂，唔係靠某一個輸入框 ★', () => {
  const blk = store.slice(store.indexOf('setExtrudeExpression: (text)'),
    store.indexOf('setExtrudeExpression: (text)') + 1400)
  assert.ok(blk.includes('EXTRUDE_MAX = 1000000'),
    '★ QA 五種提交方法都建出 1000000001 mm —— 表達式求值直接寫入 extrudeHeight，繞過輸入框 ★')
  assert.ok(blk.includes('...(over ? {} : { extrudeHeight'), '超上限唔准寫入 extrudeHeight')
  assert.ok(vp.includes('!!extrudeExpressionError ||'), '確定掣要查表達式錯誤')
})
