import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('Project All records a refreshable link and exposes Fusion-style Break Link', () => {
  assert.match(store, /projectLink: 'all'/)
  assert.match(store, /breakProjectLinks: \(\) =>/)
  assert.match(store, /已断开 \$\{count\} 条投影连结/)
  assert.match(viewport, /breakProjectLinks\(\)/)
  assert.match(viewport, /断开投影连结（Fusion Break Link）/)
  assert.match(viewport, /\.\.\.\(sketchShape \? \[sketchShape\] : \[\]\)/)
})
