/**
 * BUG-302 — simplified Chinese / mainland wording / mixed script in the zh-HK UI.
 *
 * Mechanism under test: `tStatus(s, 'zh-HK')` used to be the identity function, so every
 * simplified string emitted by `src/store.ts` (a monolith this lane may not edit) reached
 * the screen as-is. It now runs `simplifiedToTraditionalHK()` from `src/i18n/sc2tcHK.ts`.
 *
 * Three groups of assertions:
 *  1. CONVERSION   — the strings the external QA bot reported now render in HK Traditional.
 *  2. POLLUTION    — the regression the previous lane hit (a short key shredding longer
 *                    strings). Correct zh-HK copy, HK-only characters, Latin, digits and
 *                    markup must pass through byte-identical, and conversion is idempotent.
 *  3. LEAK CEILING — every Chinese string literal in the leaking source files, pushed
 *                    through the render layer, must leave no convertible simplified
 *                    character behind.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tStatus } from '../src/i18n.ts'
import { simplifiedToTraditionalHK, SC2TC_CHARS, SC2TC_HK_PHRASES } from '../src/i18n/sc2tcHK.ts'

/**
 * String-literal scanner (quotes + templates; comments and regex literals skipped).
 * Copied rather than imported from `zh-hk-no-sc-leak.test.mjs` on purpose: importing that
 * module would run its own tests inside this file's run.
 */
function stringLiterals(src) {
  const out = []
  const n = src.length
  let i = 0
  const regexStart = (k) => {
    let j = k - 1
    while (j >= 0 && /\s/.test(src[j])) j--
    if (j < 0) return true
    if ('(,=:[!&|?{};~^+-*%'.includes(src[j])) return true
    let m = j
    while (m >= 0 && /[A-Za-z]/.test(src[m])) m--
    return ['return', 'case', 'throw', 'typeof', 'delete', 'void', 'await', 'yield', 'in', 'of', 'do', 'else', 'new']
      .includes(src.slice(m + 1, j + 1))
  }
  while (i < n) {
    const ch = src[i]
    const ch2 = src[i + 1]
    if (ch === '/' && ch2 === '/') { i += 2; while (i < n && src[i] !== '\n') i++; continue }
    if (ch === '/' && ch2 === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i = Math.min(n, i + 2); continue }
    if (ch === '/' && regexStart(i)) {
      i++
      let cls = false
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '[') cls = true
        else if (src[i] === ']') cls = false
        else if (src[i] === '/' && !cls) { i++; break }
        else if (src[i] === '\n') break
        i++
      }
      while (i < n && /[a-z]/i.test(src[i])) i++
      continue
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      const q = ch
      const start = ++i
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === q) break
        if (q !== '`' && src[i] === '\n') break
        i++
      }
      out.push(src.slice(start, i))
      if (src[i] === q) i++
      continue
    }
    i++
  }
  return out
}

const hk = (s) => tStatus(s, 'zh-HK')

// ---------------------------------------------------------------- 1. conversion

/** Verbatim from the BUG-302 report → expected HK Traditional. */
const REPORTED = [
  ['点控制点拖箭嘴捏形', '點控制點拖箭嘴捏形'],
  ['点面拉伸', '點面拉伸'],
  ['相对移动', '相對移動'],
  ['内压', '內壓'],
  ['已撤销', '已撤銷'],
  ['已重做', '已重做'],
  ['已移动', '已移動'],
  ['已镜像', '已鏡像'],
  ['已矩形阵列', '已矩形陣列'],
  ['关节类型', '關節類型'],
  ['旋转', '旋轉'],
  ['滑动', '滑動'],
  ['刚性', '剛性'],
  ['组件1', '組件1'],
  ['组件2', '組件2'],
  ['最近间隙', '最近間隙'],
  ['总质量', '總質量'],
  ['实心料长', '實心料長'],
  ['组件', '組件'],
  ['结果已失效', '結果已失效'],
  ['约束', '約束'],
  ['几何', '幾何'],
  ['请重新运行', '請重新運行'],
  ['已更新参数并重建', '已更新參數並重建'],
  ['未知参数', '未知參數'],
  ['边已被圆角/倒角吃掉', '邊已被圓角/倒角吃掉'],
  ['圆角', '圓角'],
  ['抽壳', '抽殼'],
  ['已转换为实体', '已轉換為實體'],
  ['缝合', '縫合'],
  ['抽壳完成（备用：开口面偏移型腔）', '抽殼完成（備用：開口面偏移型腔）'],
]

test('BUG-302 reported strings render as HK Traditional', () => {
  for (const [sc, tc] of REPORTED) assert.equal(hk(sc), tc, `tStatus(${JSON.stringify(sc)}, 'zh-HK')`)
})

test('mainland wording becomes Hong Kong wording, not a character transliteration', () => {
  assert.equal(hk('仿真'), '模擬')
  assert.equal(hk('仿真结果已失效'), '模擬結果已失效')
  assert.equal(hk('顶点采样'), '頂點取樣')
  assert.equal(hk('优化中…'), '最佳化中…')
  assert.equal(hk('默认内存'), '預設記憶體')
  assert.equal(hk('鼠标'), '滑鼠')
  assert.equal(hk('缺省值'), '預設值')
})

test('one-simplified-to-many-traditional characters are decided per phrase', () => {
  // 并 → 並 (also) vs 併 (merge)
  assert.equal(hk('已更新参数并重建'), '已更新參數並重建')
  assert.equal(hk('合并实体'), '合併實體')
  // 复 → 復 (resume) vs 複 (duplicate)
  assert.equal(hk('恢复'), '恢復')
  assert.equal(hk('复制对象'), '複製對象')
  // 制 → 制 (control) vs 製 (manufacture)
  assert.equal(hk('控制面板'), '控制面板')
  assert.equal(hk('绘制草图'), '繪製草圖')
  // 注 → 注 (pour) vs 註 (annotate)
  assert.equal(hk('注意：浇口'), '注意：澆口')
  assert.equal(hk('注释'), '註釋')
  // 冲 → 沖 (punch) vs 衝 (impact)
  assert.equal(hk('冲压件'), '沖壓件')
  assert.equal(hk('冲突'), '衝突')
  // 系 → 系 (system) vs 係 (relation)
  assert.equal(hk('系统设置'), '系統設置')
  assert.equal(hk('关系'), '關係')
})

test('expression-parser errors reach the UI through tStatus (ExpressionInput)', () => {
  // src/cad/dimensionExpression.ts throws simplified Error text; ExpressionInput now
  // renders it via tStatus instead of raw, so the zh-HK user sees Traditional.
  assert.equal(hk('未知参数：thk'), '未知參數：thk')
  assert.equal(hk('引用参数已不存在：d1'), '引用參數已不存在：d1')
  assert.equal(hk('指数需要无单位数'), '指數需要無單位數')
  assert.equal(hk('函数需要无单位数'), '函數需要無單位數')
  assert.equal(hk('指数无效'), '指數無效')
  const src = readFileSync(new URL('../src/components/ExpressionInput.tsx', import.meta.url), 'utf8')
  assert.match(src, /tStatus\(r\.error,\s*lang\)/)
  assert.equal(src.includes('距离表达式'), false)
})

// ---------------------------------------------------------------- 2. pollution

/**
 * Pollution regression. The previous lane added 「展開」 as a tStatus key and the
 * substring path shredded longer strings into things like "ExpandOn". The SC→TC path
 * must never alter copy that is already correct zh-HK — including strings that merely
 * CONTAIN one of these words, HK-only characters (嘅/喺/咗/唔/撳/搵/睇), Cantonese
 * particles, Latin tokens, units, markup and emoji.
 */
const MUST_NOT_CHANGE = [
  '展開', '展開組', '摺疊組', '沿裝配中心向外展開組件',
  '時間軸', '點擊', '選擇工具', '完成草圖', '適應視窗', '開始建模',
  '圓角', '抽殼', '縫合', '幾何', '約束', '模擬', '參數', '元件', '組件',
  '系統設置', '控制面板', '體系', '聯繫', '關係',
  '合併實體', '複製對象', '恢復', '復原', '重複', '繪製草圖', '製造',
  '註釋', '標註', '注意：澆口', '沖壓件', '衝突', '緩衝',
  '鬆開', '採集', '取樣', '最佳化', '預設', '記憶體', '滑鼠',
  '環繞：左鍵旋轉視角（中/右鍵平移）', '縮放：左鍵上下拖動縮放（滾輪亦可）',
  '揀面配合：先點【基準件】一個面', '呢部機唔支援 WebGL2 浮點渲染目標',
  '✓ 約束求解 — 桿長剛性保持', '🧱 接觸集已開：拖關節滑桿撞到第三方組件會自動擋停',
  '已撳過', '未撳過', '搵唔到裁刀', '睇真啲', '畀我試下', '嗰個面',
  'Extrude · 拉伸 60×40×20 mm', 'Ø20 H7 · R5 · 0.1 mm', 'Cd = 0.42',
  '<b>OK</b> / Cancel', 'Fit to Window', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'abcdefghijklmnopqrstuvwxyz 0123456789 !@#$%^&*()_+-=[]{}|;:\'",.<>/?`~',
  '📐標定', '🔴', '⟷ 尺寸', '',
]

test('POLLUTION: correct zh-HK / Latin / markup copy passes through byte-identical', () => {
  for (const s of MUST_NOT_CHANGE) {
    assert.equal(simplifiedToTraditionalHK(s), s, `mutated: ${JSON.stringify(s)}`)
    assert.equal(hk(s), s, `tStatus mutated: ${JSON.stringify(s)}`)
  }
})

test('POLLUTION: no key splices a Latin token into Chinese, and conversion is idempotent', () => {
  for (const [sc, tc] of REPORTED) {
    assert.equal(simplifiedToTraditionalHK(tc), tc, `second pass changed ${JSON.stringify(tc)}`)
    // the "ExpandOn" class of bug: conversion must never inject Latin letters
    const latin = (x) => (x.match(/[A-Za-z]/g) || []).join('')
    assert.equal(latin(hk(sc)), latin(sc), `Latin injected into ${JSON.stringify(sc)}`)
    assert.equal(hk(sc).length, sc.length, `length changed for ${JSON.stringify(sc)}`)
  }
  // every mapping target is itself a fixed point — guarantees termination / no chaining
  for (const [k, v] of Object.entries(SC2TC_CHARS)) {
    assert.notEqual(k, v)
    assert.equal(simplifiedToTraditionalHK(v), v, `char target ${k}→${v} is not stable`)
  }
  for (const v of Object.values(SC2TC_HK_PHRASES)) {
    assert.equal(simplifiedToTraditionalHK(v), v, `phrase target ${v} is not stable`)
  }
})

test('POLLUTION: ambiguous characters are deliberately absent from the character map', () => {
  for (const ch of ['并', '复', '制', '注', '冲', '系', '松', '采', '卷', '里', '面', '着', '占', '愈']) {
    assert.equal(SC2TC_CHARS[ch], undefined, `${ch} must be phrase-decided, not char-mapped`)
  }
})

test('other locales are untouched by the zh-HK path', () => {
  assert.equal(tStatus('已撤销', 'zh-CN'), '已撤销')
  assert.equal(tStatus('已撤銷', 'zh-CN'), '已撤销')
  assert.equal(tStatus('適應視窗', 'en'), 'Fit to Window')
  assert.equal(tStatus('適應視窗', 'zh-CN'), '适应视窗')
  assert.equal(tStatus('', 'zh-HK'), '')
})

// ---------------------------------------------------------------- 3. leak ceiling

const FILES = [
  'src/store.ts',
  'src/components/Viewport.tsx',
  'src/components/Ribbon.tsx',
  'src/ribbon.ts',
  'src/components/BrowserTree.tsx',
  'src/components/Timeline.tsx',
  'src/components/JointsPanel.tsx',
  'src/components/PhysicsLab.tsx',
  'src/components/InspectorPanel.tsx',
  'src/components/SlicePanel.tsx',
  'src/components/Tour.tsx',
  'src/components/AiCopilot.tsx',
]

const SC_RE = new RegExp('[' + Object.keys(SC2TC_CHARS).join('') + ']')

/**
 * The source-literal ceiling in `tests/zh-hk-no-sc-leak.test.mjs` cannot be tightened from
 * this lane — those literals live in files it may not edit. This is the metric that matters
 * to the user: what the zh-HK renderer actually puts on screen. Ceiling is 0; raising it
 * means a simplified character slipped past the map, so extend `SC2TC_CHARS` instead.
 */
const MAX_RENDERED_SC_STRINGS = 0

test('zh-HK render layer emits no convertible simplified character', () => {
  const offenders = []
  for (const f of FILES) {
    for (const s of stringLiterals(readFileSync(new URL('../' + f, import.meta.url), 'utf8'))) {
      if (!/[一-鿿]/.test(s)) continue
      const out = hk(s)
      if (SC_RE.test(out)) offenders.push(`${f}: ${out}`)
    }
  }
  assert.ok(
    offenders.length <= MAX_RENDERED_SC_STRINGS,
    `rendered SC strings ${offenders.length} > ${MAX_RENDERED_SC_STRINGS}\n` + offenders.slice(0, 20).join('\n'),
  )
})
