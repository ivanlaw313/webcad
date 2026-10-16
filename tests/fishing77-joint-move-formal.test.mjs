/**
 * FISHING77: componentMove refuse Formal 以關節連結 (not 連接) — align F75.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING77 componentMove refuse uses 以關節…連結 not 連接', () => {
  const cm = read('src/assembly/componentMove.ts')
  assert.match(cm, /以關節「\$\{jn\(j0\)\}」連結 —/)
  assert.match(cm, /以關節「\$\{jn\(j0\)\}」連結到已固定的/)
  assert.match(cm, /以關節（任一方向）連結嘅組件集合/)
  assert.doesNotMatch(cm, /以關節「\$\{jn\(j0\)\}」連接/)
  assert.doesNotMatch(cm, /連接到已固定的/)
})

test('FISHING77 F76 Formal 複用 / 預設組件中心 kept', () => {
  const vp = read('src/components/Viewport.tsx')
  const st = read('src/store.ts')
  assert.match(vp, /複用模態振型動畫/)
  assert.match(st, /取代預設組件中心/)
})

test('FISHING77 MATERIALS/DENSITY_PREF SC kept', () => {
  const st = read('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
