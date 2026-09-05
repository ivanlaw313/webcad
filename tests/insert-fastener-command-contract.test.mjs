import assert from 'node:assert/strict'
import fs from 'node:fs'

const ribbon = fs.readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const store = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbonUi = fs.readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

assert.match(ribbon, /id: 'insertfastener'/, 'SOLID INSERT must expose Insert Fastener')
assert.match(store, /case 'insertfastener':/, 'the ribbon command must have a store route')
assert.match(store, /return get\(\)\.insertFastener\(kind, size, length\)/, 'the route must create the real fastener occurrence')
assert.match(store, /FASTENER_SIZES\.includes\(size\)/, 'the route must validate ISO size input')
assert.match(store, /kind !== 'hexnut' && kind !== 'washer'/, 'non-length fasteners must not ask for a fictitious length')
assert.match(ribbonUi, /function FastenerDialog/, 'ribbon must provide a single fastener settings surface')
assert.match(ribbonUi, /aria-modal="true"/, 'fastener settings surface must be a semantic modal')
assert.match(ribbonUi, /showFastenerDialog/, 'both quick command and dropdown must open the modal')
assert.match(ribbonUi, /await insertFastener\(kind, size/, 'modal must insert the real ISO component')
assert.match(ribbonUi, /e\.key === 'Escape'/, 'the modal must preserve Fusion-style Escape cancellation')

console.log('insert fastener command contract: ok')
