import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sketchLayer = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')

test('fixed sketch geometry has an explicit Fusion-style lock glyph, not colour alone', () => {
  assert.match(sketchLayer, /const fixedGlyph = \(sh:/)
  assert.match(sketchLayer, /semantic: 'fixed-geometry-lock'/)
  assert.match(sketchLayer, /profiles\.forEach\(\(sh, i\) => \{ const glyph = fixedGlyph/)
  assert.match(sketchLayer, /fixedShapes\.has\(idx\)/)
})
