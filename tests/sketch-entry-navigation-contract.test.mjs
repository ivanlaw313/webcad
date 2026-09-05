import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

function bodyAfter(anchor, size = 1000) {
  // AppState declares these methods before the Zustand implementation.  The
  // lifecycle contract must inspect the implementation, not the type line.
  const at = store.lastIndexOf(anchor)
  assert.ok(at >= 0, `missing store lifecycle anchor: ${anchor}`)
  return store.slice(at, at + size)
}

test('a new sketch begins in Select with Orbit navigation, never Rectangle draw', () => {
  assert.match(bodyAfter("startSketch: () =>", 900), /mode: 'pickplane', sketchTool: 'select', navTool: 'orbit'/)
  assert.match(bodyAfter('chooseSketchPlane: (plane)', 1100), /mode: 'sketch'[\s\S]*sketchTool: 'select', navTool: 'orbit'/)

  // Every face / mesh-face / datum-plane fresh-entry path must have the same
  // safe initial interaction.  Reopening an existing sketch is intentionally
  // outside this list and retains its normal Select state.
  for (const needle of [
    "mode: 'sketch', sketchPlane: 'XY', sketchArb: { o, xd, n: nn }, sketchBaseZ: 0, sketchTool: 'select', navTool: 'orbit'",
    "mode: 'sketch', sketchPlane: plane, sketchArb: null, sketchBaseZ: off, sketchTool: 'select', navTool: 'orbit'",
    "mode: 'sketch', sketchPlane: 'XY', sketchArb: JSON.parse(JSON.stringify(arb)) as AppState['sketchArb'], sketchBaseZ: 0, sketchTool: 'select', navTool: 'orbit'",
    "mode: 'sketch', sketchPlane: base, sketchArb: null, sketchBaseZ: Math.round(offset), sketchTool: 'select', navTool: 'orbit'",
  ]) assert.ok(store.includes(needle), `fresh sketch entry must reset select/orbit: ${needle.slice(0, 55)}…`)
})

test('Escape steps back to Select, then exits to Orbit navigation', () => {
  const esc = bodyAfter('escSketch: () =>', 2600)
  assert.match(esc, /if \(s\.sketchTool !== 'select'\)[\s\S]*sketchTool: 'select'/)
  assert.match(app, /s\.mode === 'sketch' \|\| s\.mode === 'pickplane'\) \{ if \(!s\.escSketch\(\)\) void s\.tryExitSketch\(\)/)
  const exit = bodyAfter('exitSketchMode: () =>', 1100)
  assert.match(exit, /mode: 'model', navTool: 'orbit', sketchTool: 'select'/)
})
