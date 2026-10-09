// BUG-207 跟進（G）：拖關聯偏移曲線 → 唔環繞相機 + 顯示「偏移曲線跟隨來源輪廓…」；欄位已打數值 → 首次偏移用打嘅數。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const sl = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')

test('refused drag on derived offset curve locks the camera and keeps the hint', () => {
  assert.match(st, /offsetOf\) \{ set\(\{ status: '偏移曲線跟隨來源輪廓/)
  const down = sl.slice(sl.indexOf('if (app.skDragStart(st))'), sl.indexOf('// GM-FP3 #44 框选'))
  assert.match(down, /偏移曲線跟隨來源輪廓/)
  assert.match(down, /refusedDrag\.current = true\s*\n\s*if \(controls\) controls\.enabled = false/)
  assert.match(down, /useApp\.setState\(\{ status: refusedHint \}\)/)
  assert.match(sl, /if \(refusedDrag\.current\) \{ refusedDrag\.current = false; if \(controls\) controls\.enabled = true; return \}/)
})

test('typed offset distance entered before picking wins over mouse distance', () => {
  assert.match(st, /setSketchOffsetD: \(n\) => \{ if \(!get\(\)\.sizing\) _offsetTypedPre = true;/)
  assert.match(st, /\.\.\.\(preTyped \? \{ typed: true, typedValue: s\.sketchOffsetD \} : \{\}\)/)
  assert.match(st, /setSketchTool: \(t\) => \{ _offsetTypedPre = false;/)
  // sticky typed value is what the move handler uses
  assert.match(st, /const value = typedStick \? \(sz\.typedValue as number\) : sizingValueAt/)
})
