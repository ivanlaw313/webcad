import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('Path Pattern opens a confirm dialog instead of silently creating five copies', () => {
  const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(store, /featDlg: \{ kind: 'pathpattern', params: \{ count: 5, target:.*orient: 'identical'/)
  assert.match(store, /if \(d\.kind === 'pathpattern'\)/)
  assert.match(store, /已沿路径阵列 \$\{count\} 个副本/)
  assert.match(store, /case 'pathpattern':\s*\n\s*kind = 'pathpattern'/)
  assert.match(store, /const orient = p\.orient === 'path' \? 'path' as const : 'identical' as const/)
  assert.match(store, /if \(d\.editId\) \{\s*\n\s*await get\(\)\.editFeature\(d\.editId, \{ count, targets, orient \}\)/)
  assert.match(viewport, /featDlg\.kind === 'pathpattern'/)
  assert.match(viewport, /value=\{String\(featDlg\.params\.orient \?\? 'identical'\)\}/)
})

test('Path Pattern persists a tangent-following mode for planar and spatial paths', () => {
  const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  assert.match(worker, /orient\?: 'identical' \| 'path'/)
  assert.match(worker, /const followPath = f\.orient === 'path'/)
  assert.match(worker, /const tangentAt = \(i: number\): \[number, number, number\] =>/)
  assert.match(worker, /const rotateFromSeedTangent = \(s: any, i: number\) =>/)
  assert.match(worker, /s\.rotate\(Math\.atan2\(al, dot\) \* 180 \/ Math\.PI, \[ox, oy, oz\]/)
})

test('Coil features reopen their full Create dialog from the timeline', () => {
  const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(store, /case 'coil':\s*\n\s*kind = 'coil'/)
  assert.match(store, /if \(d\.kind === 'coil' && d\.editId\)/)
  assert.match(timeline, /'pathpattern', 'coil'/)
})

test('Rib and Web features reopen their full Create dialog from the timeline', () => {
  const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(store, /case 'rib':\s*\n\s*kind = 'rib'/)
  assert.match(store, /if \(d\.editId\) \{\s*\n\s*set\(\{ featDlg: null, revAxisPtPick: false \}\)\s*\n\s*await get\(\)\.editFeature\(d\.editId, \{ thickness, height, draft, thDir, extent, flip, extend \}\)/)
  assert.match(timeline, /'coil', 'rib'/)
})
