/**
 * FISHING76: FEA prestress tip Formal 複用 not 復用 (align F75 可複用).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING76 Viewport prestress modal tip uses 複用模態振型動畫', () => {
  const vp = read('src/components/Viewport.tsx')
  assert.match(vp, /複用模態振型動畫/)
  assert.doesNotMatch(vp, /復用模態振型動畫/)
})

test('FISHING76 joint-origin Formal 可複用 kept (F75)', () => {
  const st = read('src/store.ts')
  assert.match(st, /可複用命名幀/)
  assert.doesNotMatch(st, /可復用/)
})


test('FISHING76 joint-origin UX 預設組件中心 not 預設件心', () => {
  const st = read('src/store.ts')
  const bt = read('src/components/BrowserTree.tsx')
  const jp = read('src/components/JointsPanel.tsx')
  assert.match(st, /取代預設組件中心/)
  assert.match(bt, /取代預設組件中心/)
  assert.match(jp, /父件：預設組件中心/)
  assert.doesNotMatch(st, /取代預設件心/)
  assert.doesNotMatch(jp, /父件：預設件心/)
})

test('FISHING76 MATERIALS/DENSITY_PREF SC kept', () => {
  const st = read('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
