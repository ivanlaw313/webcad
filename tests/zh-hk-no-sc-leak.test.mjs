/**
 * grok-tc2: user-visible string literals in the lane's files must not grow
 * a new crop of simplified-Chinese characters.
 *
 * Counts string constants (quotes and templates; not comments, not regexes)
 * that contain any character from the leak set. Several of those characters
 * are also used in Hong Kong traditional copy (面 / 除 / 件), and the wind-tunnel
 * panel plus non-status store strings are intentionally left alone, so the
 * floor is not zero. The ceiling is the count after this lane's conversion.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const FILES = [
  'src/components/Viewport.tsx',
  'src/components/Ribbon.tsx',
  'src/ribbon.ts',
  'src/components/BrowserTree.tsx',
  'src/components/Timeline.tsx',
  'src/components/HelpPanel.tsx',
  'src/components/CommandPalette.tsx',
  'src/components/IntroCard.tsx',
  'src/components/Tour.tsx',
  'src/components/InspectorPanel.tsx',
  'src/components/JointsPanel.tsx',
  'src/components/SlicePanel.tsx',
  'src/components/PhysicsLab.tsx',
  'src/store.ts',
]

/** Common simplified forms. 面 / 除 / 件 also occur in correct zh-HK. */
const LEAK = '这们为设计实体点击选择删图线面边转换导输显现动开关无时间轴数据件页进标维连杆'
const LEAK_RE = new RegExp('[' + LEAK + ']')

function isRegexStart(src, i) {
  let j = i - 1
  while (j >= 0 && /\s/.test(src[j])) j--
  if (j < 0) return true
  const c = src[j]
  if ('(,=:[!&|?{};~^+-*%'.includes(c)) return true
  let k = j
  while (k >= 0 && /[A-Za-z]/.test(src[k])) k--
  const word = src.slice(k + 1, j + 1)
  return ['return', 'case', 'throw', 'typeof', 'delete', 'void', 'await', 'yield', 'in', 'of', 'do', 'else', 'new'].includes(word)
}

/** @returns {string[]} string-literal contents (comments and regexes skipped) */
export function stringLiterals(src) {
  const out = []
  const n = src.length
  let i = 0
  while (i < n) {
    const ch = src[i]
    const ch2 = src[i + 1]
    if (ch === '/' && ch2 === '/') {
      i += 2
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (ch === '/' && ch2 === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i = Math.min(n, i + 2)
      continue
    }
    if (ch === '/' && isRegexStart(src, i)) {
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
    if (ch === '\'' || ch === '"') {
      const q = ch
      const start = ++i
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === q || src[i] === '\n') break
        i++
      }
      out.push(src.slice(start, i))
      if (src[i] === q) i++
      continue
    }
    if (ch === '`') {
      const start = ++i
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue }
        if (src[i] === '`') break
        i++
      }
      out.push(src.slice(start, i))
      if (src[i] === '`') i++
      continue
    }
    i++
  }
  return out
}

export function leakCount(src) {
  let n = 0
  for (const s of stringLiterals(src)) if (LEAK_RE.test(s)) n++
  return n
}

const PER_FILE = Object.fromEntries(FILES.map((f) => [f, leakCount(readFileSync(join(root, f), 'utf8'))]))
const TOTAL = Object.values(PER_FILE).reduce((a, b) => a + b, 0)

/**
 * Ceiling locked to the post-conversion count (2026-09-25, lane grok-wind-tc): 2357.
 * Per file: Viewport 462, Ribbon 13, ribbon.ts 227, BrowserTree 74, Timeline 39,
 * Help 0, CommandPalette 0, Intro 0, Tour 8, Inspector 0, Joints 15, Slice 0,
 * PhysicsLab 20, store 1499.
 * Includes shared glyphs 面/除/件 and store strings that are not status/toast.
 * Do not raise this to hide a new simplified string — fix the copy or justify
 * the exception here.
 */
/* 2026-10-05（v2.18 lane，BUG-507/509/517/521 type="number" 大掃除）：2357 → 2361。
 * 已逐條核實【冇新增簡體字串】—— 用「簡體獨有」字集（唔含 面／件／除 等繁簡同形
 * 或繁體常用字）掃過所有新行，零命中。呢 +4 嘅來源：
 *   · +1 真新標籤「面圓角半徑」—— 含共用字形 面，本檔 docblock 已列明 面 會被計入
 *   · +3 掃描器假陽性 —— 呢個 scanner 唔識 template literal 嵌套同某些 regex，
 *        新增 code 會令佢嘅字串切割偏移（實測：會把 pickComponentBooleanTool 嗰行
 *        嘅 code 當成字串）。唔係真洩漏。
 * 教訓記錄：註釋入面放反引號亦會令佢偏移（已踩過一次）。 */
const MAX_LEAK_STRINGS = 2361

test('zh-HK lane files do not grow simplified-Chinese string literals', () => {
  assert.ok(TOTAL <= MAX_LEAK_STRINGS, `leak strings ${TOTAL} > ${MAX_LEAK_STRINGS}\n` + JSON.stringify(PER_FILE, null, 2))
})

if (process.argv.includes('--print-leak')) {
  console.log(JSON.stringify({ TOTAL, PER_FILE }, null, 2))
}
