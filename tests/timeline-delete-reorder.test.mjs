// T1 delete warning + cascade, T2 reorder validity / revert, T3 New → 儲存, T4 F2 rename.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { featureRefs, featureDependents, reorderedFeatures, orderViolation } from '../src/cad/featureDeps.ts'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const tree = [
  { id: 'S1', type: 'sketch', sketchId: 'sk1' },
  { id: 'E1', type: 'extrude', sketchId: 'sk1', height: 20 },
  { id: 'S2', type: 'sketch', sketchId: 'sk2', sketchFaceBinding: { sourceId: 'E1', near: [0, 0, 20] } },
  { id: 'E2', type: 'extrude', sketchId: 'sk2', height: 5 },
  { id: 'Fi', type: 'fillet', r: 2, near: [[1, 2, 3]] },
  { id: 'Sh', type: 'shell', thickness: 1 },
]

test('refs: shared standalone sketch and any embedded feature id', () => {
  assert.deepEqual([...featureRefs(tree[1], tree)], ['S1'])
  assert.deepEqual([...featureRefs(tree[2], tree)], ['E1'], 'sketch on face of E1')
  assert.deepEqual([...featureRefs(tree[3], tree)], ['S2'])
  assert.deepEqual([...featureRefs(tree[4], tree)], [])
  assert.deepEqual([...featureRefs({ id: 'P', type: 'pattern', targets: ['E2'] }, tree)], ['E2'])
})

test('dependents: deleting a sketch lists its extrude and everything built on it (transitive)', () => {
  assert.deepEqual(featureDependents(tree, 'S1').map(f => f.id), ['E1', 'S2', 'E2'])
  assert.deepEqual(featureDependents(tree, 'E1').map(f => f.id), ['S2', 'E2'])
  assert.deepEqual(featureDependents(tree, 'E2').map(f => f.id), [])
  assert.deepEqual(featureDependents(tree, 'Sh').map(f => f.id), [])
})

test('reorder: move to index, refuse moves before a referenced parent, allow independent moves', () => {
  assert.deepEqual(reorderedFeatures(tree, 'Fi', 5).map(f => f.id), ['S1', 'E1', 'S2', 'E2', 'Sh', 'Fi'])
  assert.deepEqual(reorderedFeatures(tree, 'Sh', 4).map(f => f.id), ['S1', 'E1', 'S2', 'E2', 'Sh', 'Fi'])
  assert.equal(reorderedFeatures(tree, 'Fi', 4), null, 'no-op')
  assert.equal(reorderedFeatures(tree, 'Fi', 9), null)
  assert.equal(orderViolation(tree), null)
  const bad = orderViolation(reorderedFeatures(tree, 'E1', 0))
  assert.deepEqual([bad.feature.id, bad.needs.id], ['E1', 'S1'], 'extrude cannot move before its sketch')
  const bad2 = orderViolation(reorderedFeatures(tree, 'S2', 0))
  assert.deepEqual([bad2.feature.id, bad2.needs.id], ['S2', 'E1'], 'face sketch cannot move before its face')
  assert.equal(orderViolation(reorderedFeatures(tree, 'Fi', 1)), null, 'independent feature may move anywhere')
})

test('store wiring: delete confirm + cascade + no red leftovers; reorder = one undo step + revert', () => {
  const store = src('store.ts')
  const req = store.slice(store.indexOf('  requestRemoveFeature: async (id) => {'), store.indexOf('  reorderFeature: async (id, to) => {'))
  assert.match(req, /featureDependents\(/)
  assert.match(req, /appConfirm\(`「\$\{label\(target\)\}」被以下特徵依賴/)
  assert.match(req, /刪除「\$\{label\(target\)\}」？/, 'P2: always confirm even without deps')
  assert.match(req, /applyFeatures\(features, [^\n]*, true, undefined, before\)/, 'one recorded history entry with the exact pre-delete snapshot')
  assert.match(req, /set\(\{ failedFeatureIds: \[\], featureErrors: \{\} \}\)/, 'kept model never left red')
  assert.match(req, /刪除後以下特徵會重建失敗/)
  const reo = store.slice(store.indexOf('  reorderFeature: async (id, to) => {'), store.indexOf('  // GM-W6 F2：浏览树双击特征行改名'))
  assert.match(reo, /orderViolation\(/)
  assert.match(reo, /bad\.feature\.id === id \|\| bad\.needs\.id === id/)
  assert.match(reo, /activeBodyKeyAfter\(/, 'P2: refuse cut moves that retarget another body')
  assert.match(reo, /切割目標/)
  assert.match(reo, /applyFeatures\(next, [^\n]*, true, undefined, docSnap\(s0\)\)/)
  assert.match(reo, /已還原原順序/)
  assert.match(store, /moveFeature: async \(id, dir\) => \{[\s\S]{0,200}reorderFeature\(id, i \+ dir\)/)
  const rm = store.slice(store.indexOf('  removeFeature: async (id) => {'), store.indexOf('  requestRemoveFeature: async'))
  assert.match(rm, /const before = docSnap\(get\(\)\)[\s\S]*applyFeatures\(features, '已刪除特徵並重建', true, undefined, before\)/)
  for (const [file, re] of [['components/Timeline.tsx', /requestRemoveFeature\(sel\.id\)/], ['components/Timeline.tsx', /requestRemoveFeature\(cf\.id\)/], ['App.tsx', /requestRemoveFeature\(s\.selectedFeature\)/], ['components/Viewport.tsx', /requestRemoveFeature\(selectedFeature\)/]])
    assert.match(src(file), re, file)
  const tl = src('components/Timeline.tsx')
  assert.match(tl, /draggable=\{!commandEditing\}/)
  assert.match(tl, /onDrop=\{[^\n]*reorderFeature\(id, i\)/)
})

test('T3 New file offers 儲存 (save then new only when saved); T4 F2 rename', () => {
  const store = src('store.ts')
  const flow = store.slice(store.indexOf('  newFileFlow: async () => {'), store.indexOf('  // ── T809 AI Copilot'))
  assert.match(flow, /appChoice\(msg\('file\.newConfirm', lang\)/)
  assert.match(flow, /if \(choice === null\) return/)
  assert.match(flow, /await get\(\)\.saveProject\(\)[\s\S]*startsWith\('已儲存專案'\)\) return[\s\S]*await get\(\)\.reset\(\)/)
  assert.match(src('components/PromptDialog.tsx'), /dlg\.kind === 'confirm' && dlg\.alt[\s\S]*resolveDialog\('alt'\)/)
  assert.match(src('components/Ribbon.tsx'), /newFileFlow\(\)/)
  assert.match(src('components/CommandPalette.tsx'), /newFileFlow\(\)/)
  assert.match(src('App.tsx'), /case 'f2': if \(s\.mode !== 'sketch' && s\.selectedFeature\)[^\n]*FEATURE_RENAME_EVENT/)
  assert.match(src('components/BrowserTree.tsx'), /addEventListener\(FEATURE_RENAME_EVENT, onRename\)/)
})
