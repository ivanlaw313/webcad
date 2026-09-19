/**
 * v1.39: Component Boolean / assembly mate edge cases —
 * mate-after-edit rebuild, consume-tool mate cleanup, deleteComponent mates,
 * bake chip after boolean, Fillet dead-end bake for pure mesh.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.39+', () => {
  assert.match(version, /APP_VERSION = '1\.39'|APP_VERSION = '1\.[4-9]\d'|APP_VERSION = '[2-9]\./)
})

test('finishComponentEdit rebuilds mates that touch the edited component', () => {
  const start = store.indexOf('finishComponentEdit: () => {')
  const end = store.indexOf('cancelComponentEdit: async', start)
  assert.ok(start >= 0 && end > start, `bounds start=${start} end=${end}`)
  const block = store.slice(start, end)
  assert.match(block, /v1\.39: mate-after-edit/)
  assert.match(block, /mates\.filter\(\(m\) => m\.aComp === id \|\| m\.bComp === id\)/)
  assert.match(block, /solveMates\(\)/)
  assert.match(block, /resolveMates\(\)/)
  assert.match(block, /已重算 \$\{matesTouch\.length\} 个涉及此件的配合/)
  assert.match(block, /prevStatus/)
})

test('componentBoolean drops mates when tool occurrence is consumed', () => {
  const start = store.indexOf('componentBoolean: async')
  const end = store.indexOf('planeCutComponent: async')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /v1\.39: also drop face-mates/)
  assert.match(block, /mates\.filter\(\(m\) => m\.aComp !== bId && m\.bComp !== bId\)/)
  assert.match(block, /removedMateCount/)
  assert.match(block, /mates,/)
})

test('componentBoolean still ALWAYS sets bake statusAction after success', () => {
  const start = store.indexOf('componentBoolean: async')
  const end = store.indexOf('planeCutComponent: async')
  const block = store.slice(start, end)
  assert.match(block, /ALWAYS show primary bake statusAction after success/)
  assert.match(block, /bakeMeshToPart/)
  assert.match(block, /烘焙為零件實體/)
  assert.match(block, /點右側按鈕烘焙入零件後即可圓角\/抽殼/)
  assert.match(block, /勿與組件布爾（網格）混淆/)
})

test('componentBoolean rebuilds remaining mates involving source A', () => {
  const start = store.indexOf('componentBoolean: async')
  const end = store.indexOf('planeCutComponent: async')
  const block = store.slice(start, end)
  assert.match(block, /matesA\.length/)
  assert.match(block, /已重算 \$\{matesA\.length\} 个涉及来源件的配合/)
  assert.match(block, /Preserve bake guidance/)
})

test('deleteComponent clears dangling mates', () => {
  const start = store.indexOf('deleteComponent: (id) => set((s) => {')
  const end = store.indexOf('grounded: null,', start)
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /v1\.39: drop dangling face-mates/)
  assert.match(block, /mates\.filter\(\(m\) => m\.aComp !== id && m\.bComp !== id\)/)
  assert.match(block, /mates,/)
  assert.match(block, /连带清除/)
})

test('partSolidRequiredPatch: pure mesh offers bakeMeshToPart (not only MeshFit)', () => {
  const start = store.indexOf('function partSolidRequiredPatch')
  const end = store.indexOf('function _ptInTriXY')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /v1\.39: pure mesh/)
  assert.match(block, /id: 'bakeMeshToPart'/)
  assert.match(block, /烘焙為零件實體/)
  assert.match(block, /實體布爾=活動⊗泊車 B-rep/)
  assert.match(block, /組件布爾=網格件之間/)
  // parametric assembly path still offers MeshFit
  assert.match(block, /id: 'meshfit'/)
})

test('i18n keeps long Chinese identities for v1.39 guidance (no short Rebuilt token)', () => {
  assert.match(i18n, /v1\.39 mate-after-edit \/ compbool bake/)
  assert.doesNotMatch(i18n, /'已重算': 'Rebuilt'/)
  assert.match(i18n, /'已重算': '已重算'/)
  assert.match(i18n, /勿與組件布爾（網格）混淆/)
})
