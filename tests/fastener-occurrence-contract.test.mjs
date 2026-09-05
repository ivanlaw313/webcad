import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const start = source.indexOf('insertFastener: async')
const end = source.indexOf('// Point-4:', start)
assert.ok(start >= 0 && end > start, 'standard-fastener insertion implementation is present')
const body = source.slice(start, end)

assert.match(body, /makeDefOcc\(s\.componentDefs, nid, fastenerLabel/, 'fasteners use the canonical component definition/occurrence builder')
assert.match(body, /componentDefs: \[\.\.\.s\.componentDefs, def\]/, 'fastener definition persists alongside its occurrence')
assert.doesNotMatch(body, /const comp = \{ id: nid/, 'fasteners no longer bypass the definition model with a raw component object')

console.log('PASS standard fasteners enter the same definition/occurrence model as imported assembly components')
