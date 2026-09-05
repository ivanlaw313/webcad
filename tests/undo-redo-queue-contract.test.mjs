// Undo / redo trigger asynchronous kernel rebuilds.  This contract prevents a
// regression where rapid keyboard repeats launch overlapping rebuilds and an
// older worker response overwrites the newest document state.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('document undo/redo are serialized outside persisted CAD state', () => {
  assert.match(store, /let _historyTransition: Promise<void> = Promise\.resolve\(\)/)
  assert.match(store, /const enqueueHistoryTransition = \(op: \(\) => Promise<void>\) => \{[\s\S]*?_historyTransition = run\.catch\(\(\) => undefined\)[\s\S]*?return run/)

  const undo = store.slice(store.indexOf('  undo: () => enqueueHistoryTransition'), store.indexOf('  redo: () => enqueueHistoryTransition'))
  const redo = store.slice(store.indexOf('  redo: () => enqueueHistoryTransition'), store.indexOf('  extrudeSketch: async'))
  assert.match(undo, /await get\(\)\.applyFeatures\(prev\.features, '已撤销', false\)/)
  assert.match(redo, /await get\(\)\.applyFeatures\(next\.features, '已重做', false\)/)
  assert.match(undo, /\}\),\s*$/)
  assert.match(redo, /\}\),\s*$/)
})

test('history snapshots remain bounded and a new mutation invalidates redo', () => {
  assert.match(store, /undoStack: \[\.\.\.s\.undoStack, docSnap\(s\)\]\.slice\(-60\), redoStack: \[\]/)
  assert.match(store, /undoStack: s\.undoStack\.slice\(0, -1\), redoStack: \[\.\.\.s\.redoStack, docSnap\(s\)\]/)
  assert.match(store, /redoStack: s\.redoStack\.slice\(0, -1\), undoStack: \[\.\.\.s\.undoStack, docSnap\(s\)\]/)
})
