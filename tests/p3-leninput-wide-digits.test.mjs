/**
 * FISHING33：倒角距離等 LenInput — 打 99999 必須視覺上顯示齊（唔夾值、唔 maxLength）。
 * 合約：寬度跟 shown.length 增長；chamfer 距離欄 base w≥88；cmd-palette text 有 box-sizing。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('LenInput grows width with digit count (99999 visible); no maxLength clamp', () => {
  const i = vp.indexOf('function LenInput(')
  assert.ok(i > 0)
  const block = vp.slice(i, i + 5500)
  assert.doesNotMatch(block, /maxLength\s*=/, 'must not silently truncate via maxLength= attr')
  assert.match(block, /Math\.max\(w, 12 \+ shown\.length \* 14\)/, 'width grows with shown digit count')
  assert.match(block, /flushSync\(\(\) => setTxt/, 'txt commits before onMm store write')
})

test('chamfer distance LenInput base width fits ≥5 digits', () => {
  assert.match(vp, /edgeRoundSize[^\n]*w=\{88\}/, 'chamfer 距離 base w=88')
  assert.match(vp, /chamferSize2[^\n]*w=\{88\}/, 'chamfer 距離2 base w=88')
})

test('cmd-palette text inputs use border-box (inner width not eaten by padding)', () => {
  assert.match(css, /\.cmd-palette-body input\[type=text\]\s*\{\s*box-sizing:\s*border-box/)
})
