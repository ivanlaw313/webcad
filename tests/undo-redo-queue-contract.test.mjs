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
  // Current impl: applyFeatures(..., reopen ? SKETCH_FINISH_UNDO_STATUS : '已撤销', ...)
  assert.match(undo, /applyFeatures\(/)
  assert.match(undo, /已撤销|已撤銷|SKETCH_FINISH_UNDO_STATUS/)
  assert.match(redo, /applyFeatures\(/)
  assert.match(redo, /已重做/)
  assert.match(undo, /enqueueHistoryTransition/)
  assert.match(redo, /enqueueHistoryTransition/)
})

test('history snapshots remain bounded and a new mutation invalidates redo', () => {
  assert.match(store, /undoStack: \[\.\.\.s\.undoStack, docSnap\(s\)\]\.slice\(-60\), redoStack: \[\]/)
  // Current: redoEntry = docSnap(s); redoStack: [...s.redoStack, redoEntry]
  assert.match(store, /redoStack: \[\.\.\.s\.redoStack, redoEntry\]/)
  assert.match(store, /undoStack: s\.undoStack\.slice\(0, -1\)/)
  assert.match(store, /redoStack: s\.redoStack\.slice\(0, -1\)/)
})
