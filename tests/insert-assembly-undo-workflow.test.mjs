// Insert -> Assembly placement is one user action: selecting "ground" in the
// import dialog must not consume a separate Ctrl+Z before the imported part is
// removed.  Keep the placement math pure so the CAD/three coordinate mapping
// is covered without a browser or worker.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { meshInsertPosition } from '../src/cad/insertModel.ts'

const mesh = [10, 20, 5, 30, 40, 25, 10, 40, 25]

test('Insert placement maps CAD Z-up mesh to Assembly ground and centre', () => {
  assert.deepEqual(meshInsertPosition(mesh, 130, 'none'), [130, 0, 0], 'unplaced import keeps the assembly running origin')
  assert.deepEqual(meshInsertPosition(mesh, 130, 'center'), [-20, 0, 30], 'center aligns world XZ (CAD X,-Y) without changing height')
  assert.deepEqual(meshInsertPosition(mesh, 130, 'ground'), [-20, -5, 30], 'ground also puts the CAD lowest Z on world Y=0')
  assert.deepEqual(meshInsertPosition([NaN, 0, 0], 130, 'ground'), [130, 0, 0], 'invalid mesh cannot create an invalid Assembly occurrence pose')
})

test('STL and OBJ import commit placement before the single document history entry', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  for (const action of ['importStl: async', 'importObj: async']) {
    const from = store.indexOf(`  ${action}`)
    const nextAction = action.startsWith('importStl') ? '  importObj: async' : '  openObjDialog:'
    const to = store.indexOf(`\n${nextAction}`, from + action.length)
    const body = store.slice(from, to)
    assert.match(body, /meshInsertPosition\(mesh\.vertices, get\(\)\.originX, opt\?\.place\)/, `${action} computes optional placement before committing occurrence`)
    assert.match(body, /undoStack: \[\.\.\.s\.undoStack, docSnap\(s\)\]/, `${action} records exactly its import transaction in document history`)
    assert.doesNotMatch(body, /seatComponent\(|centerComponentXZ\(/, `${action} does not add a second Assembly placement undo step`)
  }
})
