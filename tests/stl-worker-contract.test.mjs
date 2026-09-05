import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const worker = readFileSync(new URL('../src/worker/mesh.worker.ts', import.meta.url), 'utf8')
const client = readFileSync(new URL('../src/analysis/meshClient.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('STL parsing is run in the reusable mesh worker with a transferred input buffer', () => {
  assert.match(worker, /import \{ parseSTL \} from '\.\.\/io\/stl'/)
  assert.match(worker, /parseStl\(buf: ArrayBuffer\).*parseSTL\(buf\)/s)
  assert.match(client, /parseStlInWorker\(buf: ArrayBuffer\)/)
  assert.match(client, /parseStl\(transfer\(buf, \[buf\]\)\)/)
  const importStart = store.indexOf('  importStl: async')
  const importEnd = store.indexOf('  importObj: async', importStart)
  assert.ok(importStart >= 0 && importEnd > importStart, 'importStl action is bounded')
  const importStl = store.slice(importStart, importEnd)
  assert.match(importStl, /parseStlInWorker\(buf\)/)
  assert.doesNotMatch(importStl, /parseSTL\(buf\)/)
})

test('OBJ and 3MF parsing also use the import worker, with 3MF buffers transferred', () => {
  assert.match(worker, /import \{ parseOBJ \} from '\.\.\/io\/obj'/)
  assert.match(worker, /import \{ parse3MF \} from '\.\.\/io\/threeMfImport'/)
  assert.match(client, /parseObjInWorker\(text: string\)/)
  assert.match(client, /parse3mfInWorker\(buf: ArrayBuffer\)/)
  assert.match(client, /parse3mf\(transfer\(buf, \[buf\]\)\)/)
  const objStart = store.indexOf('  importObj: async')
  const objEnd = store.indexOf('  openObjDialog:', objStart)
  const mfStart = store.indexOf('  import3MF: async')
  const mfEnd = store.indexOf('  open3MFDialog:', mfStart)
  assert.match(store.slice(objStart, objEnd), /parseObjInWorker\(text\)/)
  assert.match(store.slice(mfStart, mfEnd), /parse3mfInWorker\(buf\)/)
})
