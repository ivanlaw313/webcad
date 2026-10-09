// ctx-menu-visibility.test.mjs — Fusion-style context-sensitive menus (viewport face/edge/empty, browser tree rows)
// + root-body visibility state (toggle / show-all / project persistence).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const M = await import('../src/ui/contextMenus.ts')
const { useApp, buildProjectPayload } = await import('../src/store.ts')
const g = () => useApp.getState()
const all = (l) => [...l.sectors, ...l.overflow].filter((k) => k && k !== 'sep')

test('viewport menu differs by hit: face / edge / empty', () => {
  const face = M.modelMenuLayout('face'), edge = M.modelMenuLayout('edge'), empty = M.modelMenuLayout('empty')
  for (const l of [face, edge, empty, M.modelMenuLayout('body'), M.modelMenuLayout('component')]) {
    assert.equal(l.sectors.length, 8, 'radial menu has exactly 8 sectors')
    assert.equal(l.sectors[0], 'repeat', 'N sector is always repeat')
  }
  const F = all(face), E = all(edge), X = all(empty)
  for (const k of ['sketch', 'presspull', 'shell', 'delface', 'facefillet', 'measure', 'appearance', 'hidebody']) assert.ok(F.includes(k), `face has ${k}`)
  for (const k of ['fillet', 'chamfer']) assert.ok(!F.includes(k), `face lacks edge-only ${k}`)
  for (const k of ['fillet', 'chamfer', 'measure']) assert.ok(E.includes(k), `edge has ${k}`)
  for (const k of ['shell', 'delface', 'facefillet', 'sketch', 'bsection', 'expq']) assert.ok(!E.includes(k), `edge lacks ${k}`)
  for (const k of ['repeat', 'fit', 'viso', 'vtop', 'vfront', 'vright', 'showall']) assert.ok(X.includes(k), `empty has ${k}`)
  for (const k of ['presspull', 'fillet', 'chamfer', 'shell', 'delface', 'facefillet', 'hidebody']) assert.ok(!X.includes(k), `empty lacks ${k}`)
  assert.notDeepEqual(F, E); assert.notDeepEqual(E, X)
  assert.ok(all(M.modelMenuLayout('empty', { hasSelection: true })).includes('del'))
  assert.ok(!all(M.modelMenuLayout('empty')).includes('del'))
  assert.ok(all(M.modelMenuLayout('component')).includes('hidecomp'))
  assert.ok(all(M.modelMenuLayout('edge', { anyHidden: true })).includes('showall'))
})

test('pickItems filters by key, keeps null sectors, collapses separators, expands arrays', () => {
  const a = { key: 'a' }, b = { key: 'b' }, c1 = { key: 'c1' }, c2 = { key: 'c2' }
  const out = M.pickItems(['sep', 'a', 'missing', null, 'sep', 'sep', 'grp', 'empty', 'sep', 'b', 'sep'], { a, b, grp: [c1, c2], empty: [] })
  assert.deepEqual(out, [a, null, 'sep', c1, c2, 'sep', b])
})

test('browser tree menu items per row kind', () => {
  const body = M.treeMenuKeys('activeBody')
  for (const k of ['hide', 'createComp', 'appearance', 'physmat']) assert.ok(body.includes(k), `body has ${k}`)
  assert.ok(M.treeMenuKeys('activeBody', { hidden: true }).includes('show'))
  assert.ok(!M.treeMenuKeys('activeBody', { hidden: true }).includes('hide'))
  const sk = M.treeMenuKeys('sketch', { canRename: true })
  assert.equal(sk[0], 'editSketch'); assert.ok(sk.includes('rename')); assert.ok(!sk.includes('delete'))
  assert.ok(M.treeMenuKeys('sketch', { canDelete: true }).includes('delete'))
  const comp = M.treeMenuKeys('component', { canRename: true })
  for (const k of ['hide', 'rename', 'delete']) assert.ok(comp.includes(k), `component has ${k}`)
  assert.ok(M.treeMenuKeys('root').includes('showAll'))
})

test('edge proximity is screen-space', () => {
  const seg = [0, 0, 100, 0, NaN, 0, 5, 5]
  assert.ok(M.nearEdgePx(seg, 50, 4, 6))
  assert.ok(!M.nearEdgePx(seg, 50, 9, 6))
  assert.ok(!M.nearEdgePx(seg, 110, 0, 6))
})

test('visibility helpers', () => {
  assert.deepEqual(M.toggleHiddenKey([], 'active'), ['active'])
  assert.deepEqual(M.toggleHiddenKey(['active'], 'active'), [])
  const h = ['x']; assert.equal(M.setHiddenKey(h, 'x', true), h, 'no-op keeps identity')
  assert.deepEqual(M.setHiddenKey(h, 'x', false), [])
  assert.equal(M.parkedBodyKey('實體2', 0), 'pk:實體2'); assert.equal(M.parkedBodyKey('', 3), 'pk#3')
  assert.deepEqual(M.sanitizeBodyHidden(['a', 'a', 3, null, '', 'b']), ['a', 'b'])
  assert.deepEqual(M.sanitizeBodyHidden(undefined), [])
})

test('store: toggle / show-all / object visibility master switch', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.deepEqual(g().bodyHidden, [])
  assert.equal(g().objectVis.bodies, true)
  g().toggleBodyHidden(M.ACTIVE_BODY_KEY)
  assert.deepEqual(g().bodyHidden, ['active'])
  g().setBodyHidden('pk:B2', true); g().setBodyHidden('pk:B2', true)
  assert.deepEqual(g().bodyHidden, ['active', 'pk:B2'])
  g().toggleBodyHidden(M.ACTIVE_BODY_KEY)
  assert.deepEqual(g().bodyHidden, ['pk:B2'])
  g().setObjectVis('bodies', false)
  assert.equal(g().objectVis.bodies, false)
  useApp.setState({ components: [{ id: 'C1', name: 'c', hidden: true, mesh: { vertices: [], triangles: [], normals: [] }, pos: [0, 0, 0] }] })
  g().showAllBodies()
  assert.deepEqual(g().bodyHidden, [])
  assert.equal(g().objectVis.bodies, true)
  assert.equal(g().components[0].hidden, false)
})

test('project payload persists bodyHidden only when something is hidden; all readers hydrate it', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.ok(!('bodyHidden' in buildProjectPayload(g())), 'default → key omitted (byte-compatible)')
  g().toggleBodyHidden('pk:B2')
  assert.deepEqual(buildProjectPayload(g()).bodyHidden, ['pk:B2'])
  const src = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.equal((src.match(/bodyHidden: sanitizeBodyHidden\((d|data)\.bodyHidden\)/g) || []).length, 3, 'snapshot / open / autosave loaders hydrate bodyHidden')
})
