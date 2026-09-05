import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('Offset Plane opens the Construction Geometry workflow with explicit origin bases', () => {
  assert.match(store, /case 'offsetplane': return get\(\)\.openDatumCmd\(\{ type: 'plane', method: 'offset' \}\)/)
  assert.match(store, /'plane:offset'.*base: 'XY'/)
  assert.match(viewport, /圓柱／圓錐側面不能當偏移基準/)
  for (const base of ['XY(上)', 'XZ(前)', 'YZ(右)']) assert.ok(viewport.includes(base), `origin base ${base} is present`)
})
