import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')

test('Transform feature reopens Move/Copy with its full parametric pose', () => {
  // A transform has to be allowed through the timeline edit gate first.
  assert.match(timeline, /'scale', 'transform', 'draft'/)

  // Then it must reconstruct the same Move/Copy dialog fields from the
  // transform feature instead of falling back to a non-editable selection.
  assert.match(store, /case 'transform':\s*[\s\S]*?kind = 'move'/)
  assert.match(store, /case 'transform':[\s\S]*?dx: f\.dx, dy: f\.dy, dz: f\.dz,[\s\S]*?rx: f\.rx \?\? 0, ry: f\.ry \?\? 0, rz: f\.rz \?\? 0/)

  // A copied transform is already paired with CopyPasteBodies. Re-editing it
  // must change the existing pose rather than generating a second body.
  assert.match(store, /case 'transform':[\s\S]*?createCopy: 0/)
})
