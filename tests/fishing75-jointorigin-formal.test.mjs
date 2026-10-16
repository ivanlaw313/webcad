/**
 * FISHING75: Formal 可複用 (not 可復用) for joint-origin UX; 以關節連結 not 連接.
 * Align store/BrowserTree/JointsPanel with tip.jointorigin / ribbon GM-3DV4.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING75 tip.jointorigin + ribbon use 可複用命名幀', () => {
  const hk = read('src/i18n/locales/zh-HK.ts')
  const rb = read('src/ribbon.ts')
  assert.match(hk, /tip\.jointorigin.*可複用命名幀/)
  assert.match(rb, /可複用命名幀/)
  assert.doesNotMatch(hk, /可復用/)
})

test('FISHING75 store/BrowserTree/JointsPanel joint-origin Formal 可複用 not 可復用', () => {
  const st = read('src/store.ts')
  const bt = read('src/components/BrowserTree.tsx')
  const jp = read('src/components/JointsPanel.tsx')
  assert.match(st, /可複用命名幀|可複用「/)
  assert.match(st, /落一個可複用命名幀/)
  assert.match(st, /已建可複用「/)
  assert.match(bt, /可複用關節原點/)
  assert.match(jp, /可複用關節原點/)
  for (const s of [st, bt, jp]) assert.doesNotMatch(s, /可復用/)
})

test('FISHING75 move-with-joints status 以關節連結; MATERIALS SC kept', () => {
  const st = read('src/store.ts')
  const cm = read('src/assembly/componentMove.ts')
  assert.match(st, /以關節連結的/)
  assert.doesNotMatch(st, /以關節連接的/)
  assert.match(cm, /以關節連結/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
