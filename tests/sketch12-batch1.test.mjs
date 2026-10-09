// SKETCH12 batch 1（瀏覽器測試員）回歸：矩形▾/圓▾/圓弧▾ 分拆按鈕、圓重做保留約束、中心矩形 DOF、
// 相切弧自動相切 + 相切不違反驅動尺寸、圓提示為直徑、DOF 永遠顯示、原點吸附勝格點、畫折線時 Ctrl+Y。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const { SKETCH_PANELS } = await import('../src/ribbon.ts')
const { ribbonCmdLabel } = await import('../src/i18n.ts')

const create = SKETCH_PANELS.find((p) => p.name === 'CREATE').tools
const modify = SKETCH_PANELS.find((p) => p.name === 'MODIFY').tools

test('#1 sketch CREATE: Rectangle ▾ / Circle ▾ / Arc ▾ split buttons list every creation method (quick icons)', () => {
  const fam = { sk_rect: ['sk_rect', 'sk_rect3', 'sk_crect'], sk_circle: ['sk_circle', 'sk_circle2p', 'sk_circle3', 'sk_circle2t', 'sk_circle3t'], sk_arc: ['sk_arc', 'sk_arcc', 'sk_tanarc'] }
  for (const [id, kids] of Object.entries(fam)) {
    const t = create.find((x) => x.id === id)
    assert.ok(t?.quick, `${id} is a quick ribbon icon`)
    assert.deepEqual(t.quickChildren.map((c) => c.id), kids, `${id} ▾ lists ${kids}`)
    for (const k of kids) assert.ok(create.some((x) => x.id === k), `${k} also in the CREATE ▾ group menu`)
  }
  // dropdown rows are distinguishable in every language (default child is not just「圓」/「矩形」/「圓弧」)
  for (const lang of ['zh-HK', 'zh-CN', 'en', 'ja']) {
    for (const id of ['sk_rect', 'sk_circle', 'sk_arc']) {
      const labels = create.find((x) => x.id === id).quickChildren.map((c) => ribbonCmdLabel(c.id, lang, c.label))
      assert.equal(new Set(labels).size, labels.length, `${lang} ${id}: ${labels}`)
    }
  }
  assert.equal(ribbonCmdLabel('sk_circle', 'zh-HK', '圓心直徑圓'), '圓心直徑圓')
  assert.equal(ribbonCmdLabel('sk_rect', 'en', '兩點矩形'), '2-Point Rectangle')
})

test('#1 new tool tips: formal written Traditional, no Fusion mention; circle hint says diameter', () => {
  const ids = ['sk_rect', 'sk_rect3', 'sk_crect', 'sk_circle', 'sk_circle2p', 'sk_circle3', 'sk_circle2t', 'sk_circle3t', 'sk_arc', 'sk_arcc', 'sk_tanarc']
  for (const id of ids) for (const t of [create.find((x) => x.id === id), ...create.flatMap((x) => x.quickChildren ?? []).filter((x) => x.id === id)]) {
    assert.doesNotMatch(t.tip, /[撚仲係嘅唔]|Fusion/, `${id}: ${t.tip}`)
  }
  const circle = create.find((x) => x.id === 'sk_circle')
  assert.match(circle.tip, /直徑/); assert.doesNotMatch(circle.tip, /半徑/)
})

test('batch 2: Extend is a quick icon next to Trim', () => {
  const i = modify.findIndex((x) => x.id === 'sk_trim'), j = modify.findIndex((x) => x.id === 'sk_extend')
  assert.ok(modify[j].quick); assert.equal(j, i + 1)
})

// ---------- #2–#5 store / solver level ----------
const { useApp, polyRedoApplies, arc3 } = await import('../src/store.ts')
const { centerRectExtras } = await import('../src/sketch/centerRect.ts')
const { crossShapeTangentCons } = await import('../src/sketch/tangentArc.ts')
const { solveFree, refPts } = await import('../src/sketch/freesolve.ts')
const g = () => useApp.getState()
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms))
const fresh = (extra = {}) => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchPlane: 'XY', sketchProfiles: [], sketchShape: null, skCons: [], appConfirm: async () => true, ...extra }, true)
const conSig = (cs) => cs.map((c) => `${c.kind}:${c.type}:${JSON.stringify(c.a)}:${JSON.stringify(c.b ?? null)}:${c.value ?? ''}`).sort()

test('#2 typed circle Ø at origin: dia + coincident, own undo step, Ctrl+Y restores the constraints exactly', async () => {
  fresh({ sketchTool: 'circle', autoConstrain: true })
  g().sketchTypeKey('0'); g().sketchTypeKey('Tab'); g().sketchTypeKey('0'); g().sketchTypeKey('Enter')
  g().sketchTypeKey('2'); g().sketchTypeKey('0'); g().sketchTypeKey('Enter')
  await settle(200)
  const before = conSig(g().skCons)
  assert.ok(g().skCons.some((c) => c.kind === 'dim' && c.type === 'dia' && c.value === 20), 'driving Ø20')
  assert.ok(g().skCons.some((c) => c.kind === 'con' && c.type === 'coincident' && (c.a.kind === 'origin' || c.b?.kind === 'origin')), 'centre ≡ origin: ' + before.join(' | '))
  await g().undo(); await settle()
  assert.equal(g().sketchShape, null, 'undo removes the circle')
  assert.equal(g().skCons.length, 0, 'undo removes its constraints')
  await g().redo(); await settle(200)
  assert.equal(g().sketchShape?.type, 'circle')
  assert.deepEqual(conSig(g().skCons), before, 'redo restores identical constraints')
  assert.equal(g().skDof, 0)
})

test('#3 centre rectangle: free = DOF 4 (position counted); centre on origin = diagonal + midpoint, DOF 2', async () => {
  const rect = { type: 'rect', a: [-10, -5], b: [10, 5] }
  assert.equal(centerRectExtras([], { type: 'rect', a: [0, 0], b: [20, 10] }, [10, 5], []), null, 'unsnapped centre → no extras')
  fresh({ sketchShape: { type: 'rect', a: [0, 0], b: [20, 10] } })
  await g().refreshSkDof(); assert.equal(g().skDof, 4, 'free rect: w, h, x, y')
  const ex = centerRectExtras([], rect, [0, 0], [])
  assert.ok(ex && ex.diag.construction, 'construction diagonal')
  assert.deepEqual(ex.cons.map((c) => c.type), ['coincident', 'coincident', 'midpoint'])
  assert.equal(ex.cons[2].a.kind, 'origin')
  fresh({ sketchProfiles: [ex.diag], sketchShape: rect, skCons: ex.cons })
  await g().resolveSk(); await settle()
  assert.equal(g().skDof, 2, 'only width/height remain')
})

test('#4 crossShapeTangentCons: G1 arc leaving a line end gets tangent; a kinked arc does not', () => {
  const line = { type: 'poly', pts: [[0, 0], [20, 0]], verts: [[0, 0], [20, 0]], bulges: [0], open: true }
  const mk = (bu) => ({ type: 'poly', pts: [[20, 0], [30, 10]], verts: [[20, 0], [30, 10]], bulges: [bu], open: true })
  let n = 0; const id = () => 'x' + n++
  const q = Math.tan(Math.PI / 8)
  const hits = [q, -q].map((bu) => crossShapeTangentCons([line, mk(bu)], 1, [], id))
  assert.equal(hits.filter((h) => h.length === 1).length, 1, 'exactly one bulge sign is G1 with +x')
  const t = hits.find((h) => h.length)[0]
  assert.equal(t.type, 'tangent'); assert.deepEqual(t.a, { kind: 'edge', shape: 0, idx: 0 }); assert.deepEqual(t.b, { kind: 'edge', shape: 1, idx: 0 })
  const kink = { type: 'poly', pts: [[20, 0], [20, 20]], verts: [[20, 0], [20, 20]], bulges: [Math.tan(Math.PI / 16)], open: true }
  assert.deepEqual(crossShapeTangentCons([line, kink], 1, [], id), [], 'non-G1 join → no tangent')
  assert.deepEqual(crossShapeTangentCons([line, mk(hits[0].length ? q : -q)], 1, [t], id), [], 'no duplicate tangent')
})

test('#4 manual tangent (line selected first) keeps the dimensioned line; the arc moves', async () => {
  const L = { type: 'poly', pts: [[0, 0], [40, 0]], verts: [[0, 0], [40, 0]], bulges: [0], open: true }
  const A = { type: 'poly', pts: arc3([40, 0], [60, 0], [50, 8]), arc: { a: [40, 0], b: [60, 0], m: [50, 8] }, open: true }
  const cons = [{ id: 'k12len', kind: 'dim', type: 'len', a: { kind: 'edge', shape: 0, idx: 0 }, value: 40 },
    { id: 'k12co', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: 0, idx: 1 }, b: { kind: 'pt', shape: 1, idx: 0 } }]
  fresh({ sketchTool: 'select', sketchProfiles: [L, A], skCons: cons, skSel: [{ kind: 'edge', shape: 0, idx: 0 }, { kind: 'circle', shape: 1 }] })
  await g().addSkCon('tangent'); await settle(200)
  assert.ok(g().skCons.some((c) => c.type === 'tangent'), 'tangent added: ' + g().status)
  const l = g().sketchProfiles[0].verts ?? g().sketchProfiles[0].pts
  assert.ok(Math.hypot(l[0][0], l[0][1]) < 1e-4 && Math.hypot(l[1][0] - 40, l[1][1]) < 1e-4, 'line unchanged: ' + JSON.stringify(l))
  const a = g().sketchProfiles[1].arc
  assert.ok(Math.hypot(a.a[0] - 40, a.a[1]) < 1e-4, 'arc still joined at the line end')
  assert.ok(Math.hypot(a.m[0] - 50, a.m[1] - 8) > 1e-3 || Math.hypot(a.b[0] - 60, a.b[1]) > 1e-3, 'arc moved to become tangent')
  const r = await solveFree(g().sketchProfiles, g().skCons); assert.ok(r, 'solvable, no conflict')
})

test('#5 polyline Ctrl+Z / Ctrl+Y while drawing redoes the last undone segment; guard rejects stale entries', async () => {
  fresh({ sketchTool: 'polyline', polyPts: [[0, 0], [10, 0], [10, 5]], polyBulges: [0, 0], sketchStart: [0, 0] })
  await g().undo(); assert.equal(g().polyPts.length, 2)
  await g().undo(); assert.equal(g().polyPts.length, 1)
  await g().redo(); assert.deepEqual(g().polyPts, [[0, 0], [10, 0]])
  await g().redo(); assert.deepEqual(g().polyPts, [[0, 0], [10, 0], [10, 5]])
  const e = { before: [[0, 0]], p: [1, 1], bulges: [], profiles: g().sketchProfiles, shape: g().sketchShape, tool: 'polyline' }
  assert.equal(polyRedoApplies(e, { ...g(), polyPts: [[0, 0]] }), true)
  assert.equal(polyRedoApplies(e, { ...g(), polyPts: [[0, 0], [3, 3]] }), false, 'new point drawn after undo → no redo')
  assert.equal(polyRedoApplies(e, { ...g(), polyPts: [[0, 0]], sketchProfiles: [] }), false, 'different sketch → no redo')
})

test('#5 DOF is computed without constraints (arc-only sketch) and never shown as —', async () => {
  fresh({ sketchShape: { type: 'poly', pts: arc3([0, 0], [20, 0], [10, 5]), arc: { a: [0, 0], b: [20, 0], m: [10, 5] }, open: true } })
  await g().refreshSkDof()
  assert.equal(typeof g().skDof, 'number'); assert.ok(g().skDof > 0)
  const vp = (await import('node:fs')).readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /DOF \$\{skDof \?\? '…'\}/, 'null DOF shows … (never —)')
  assert.match(vp, /\(skCons\.length > 0 \|\| sketchProfiles\.length > 0 \|\| !!sketchShape\) && \(\s*<span className="sb-hint" data-testid="sketch-dof"/, 'DOF shown for any geometry')
})

test('#5 no bounding-box readout for multi-segment open polylines (old residue near the start point)', () => {
  const src = (globalThis.__sl ??= (createRequire(import.meta.url)('node:fs')).readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8'))
  assert.match(src, /if \(openSegs > 1\) return/)
})
