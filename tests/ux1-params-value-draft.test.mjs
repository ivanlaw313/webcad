// UX1 #1：參數面板「數值」欄逐鍵唔可以 commit／重寫（打 '12' 變 '2'）。真瀏覽器證明：scripts/e2e-params-value.mjs。
// 呢度：source 合約 —— 數值欄同「＋新增」行數值欄都唔用 type="number"（Chrome 中途值會被剝／滾輪改值，見 bug507），
// 草稿字串、只喺 Enter／失焦 commit；新增行非數字唔會靜默變 0。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../src/components/ParamsPanel.tsx', import.meta.url), 'utf8')
// Row field uses className={'pp-val'+…}; add-row uses className="pp-val". Match both self-closing tags.
const tags = [...src.matchAll(/<input className=(?:"pp-val"|\{'pp-val'[^\n]*?\})[^\n]*?\/>/g)].map((m) => m[0])

test('both value inputs are text drafts with decimal keypad, never type=number', () => {
  assert.equal(tags.length, 2)
  for (const t of tags) { assert.doesNotMatch(t, /type="number"/); assert.match(t, /type="text" inputMode="decimal"/) }
})
test('row value field: onChange only edits the draft; commit on blur / Enter(blur); Esc restores', () => {
  const row = tags.find((t) => t.includes('data-param-field="value"'))
  assert.ok(row, 'row pp-val with data-param-field')
  assert.match(row, /onChange=\{e=>setDraft\(e\.target\.value\)\}/)
  assert.match(row, /onBlur=\{commit\}/)
  assert.match(row, /e\.key==='Enter'[\s\S]*?e\.currentTarget\.blur\(\)/)
  assert.doesNotMatch(row, /onChange=[^}]*onCommit/)
})
test('add-row value field keeps a string draft; add() validates instead of Number("") → 0', () => {
  assert.match(src, /const \[val, setVal\] = useState\('50'\)/)
  const add = tags.find((t) => !t.includes('data-param-field'))
  assert.ok(add, 'add-row pp-val')
  assert.match(add, /onChange=\{\(e\) => setVal\(e\.target\.value\)\}/)
  assert.doesNotMatch(add, /Number\(e\.target\.value\)/)
  assert.match(src, /const v = Number\(val\); if \(!val\.trim\(\) \|\| !Number\.isFinite\(v\)\)/)
})
test('real-browser proof script exists and is outside the default test run', () => {
  const e2e = readFileSync(new URL('../scripts/e2e-params-value.mjs', import.meta.url), 'utf8')
  assert.match(e2e, /for \(const ch of '12'\)/)
  const pj = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.ok(!JSON.stringify(pj.scripts).includes('e2e-'))
})
