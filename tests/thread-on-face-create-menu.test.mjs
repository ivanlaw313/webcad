import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('CREATE exposes a Thread-on-face command next to Hole (not only the standalone rod)', () => {
  const create = ribbon.slice(ribbon.indexOf("name: 'CREATE'"), ribbon.indexOf("name: 'MODIFY'"))
  const iHole = create.indexOf("id: 'hole'"), iFace = create.indexOf("id: 'facethread', label: '螺紋'"), iRod = create.indexOf("id: 'thread', label: '螺紋桿'")
  assert.ok(iHole > 0 && iFace > iHole && iRod > iFace, 'order: 孔 → 螺紋 → 螺紋桿')
})

test('facethread routes to the cylindrical-face pick (cosmetic/modeled + ISO presets dialog)', () => {
  assert.match(store, /case 'facethread':[^\n]*\n\s+case 'othread': \{\n[^\n]*\n\s+return get\(\)\.startThreadFacePick\(\)/)
  assert.match(store, /ISO_COARSE: Record<number, number> = \{ 3: 0\.5,[^}]*20: 2\.5/)
  assert.match(store, /cosmetic: \+\(p\.modeled \|\| 0\) \? undefined : true/)
})
