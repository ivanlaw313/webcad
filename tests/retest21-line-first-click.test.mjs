// RETEST21 #4: first click after choosing Line must not be swallowed by a stale "drag-draw" gesture ref.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')

test('stale dragDraw on mouse press is cleared and the press proceeds (only a different touch pointer cancels)', () => {
  const i = src.indexOf('if (dragDraw.current) {\n      const dd0 = dragDraw.current')
  assert.ok(i > 0, 'down() handles a leftover dragDraw')
  const block = src.slice(i, i + 600)
  assert.match(block, /e\.pointerType !== 'mouse'/)
  assert.match(block, /e\.pointerId !== dd0\.pointerId/)
  assert.match(block, /if \(secondFinger\) return/)
  assert.doesNotMatch(src, /if \(dragDraw\.current\) \{ dragDraw\.current = null; if \(controls\) controls\.enabled = true; return \}/)
  assert.match(src, /dragDraw\.current = \{[^}]*pointerId: e\.pointerId \}/)
})

test('gesture refs reset whenever the sketch tool or mode changes', () => {
  const m = src.match(/useEffect\(\(\) => \{\n(?:\s*\/\/[^\n]*\n)*\s*if \(dragDraw\.current && dragDraw\.current\.tool === gestureTool\) return\n\s*const had = [^\n]*\n\s*dragDraw\.current = null; arcGesture\.current = null; marquee\.current = null; refusedDrag\.current = false[^\n]*\n[^\n]*\n\s*\}, \[gestureTool, gestureMode, controls\]\)/)
  assert.ok(m, 'reset effect keyed on sketchTool/mode')
  assert.ok(src.indexOf(m[0]) < src.indexOf("if (mode !== 'sketch') return null"), 'effect declared before the early return (hook order)')
})
