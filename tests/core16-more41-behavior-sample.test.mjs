/**
 * BOT-D more41 / FISHING77+ — CORE16 true behavior / regression gaps on tip 4b5626f.
 * Complements smoke-21 + more34–more40 samples without duplicating those topics.
 * more34: box/cyl-cut vol, revolve/sweep refuse, refuse→360, fillet-then-refuse, MATERIALS+F54.
 * more35: MATERIALS+F54, copy, boolean cut ΔV, shell→fillet, split, 2×1 pattern-after-cut, hole csink,
 * move cancel, emboss depth0, undo two-step (box→fillet→cut).
 * more36: MATERIALS, F56 趨勢著色, hide/rebuild, arb through, chamfer two-dist, loft thin-wall,
 * thicken 99999, timeline reorder, pushpull, cyl/cone vol, importStep garbage.
 * more37: MATERIALS, F58 匯入, box/cyl/cone 0, fillet/hole/pattern gate, extrude through-cut ≈πr²h,
 * chamfer dist2=0, thicken 0/99999, timeline-chip legal revolve/wall0.
 * more38: MATERIALS+F60 tip.joint, loft rail, loft <2 sections, emboss AB preview, extrude dist,
 * extrude cut-through, sketch dual-icon, 2×2 body pattern, b3 shell/split.
 * more39: MATERIALS+F62 tip.align/tip.joint, revolve cut groove, mirror gate, emboss size0/neg,
 * cyl/cone timeline label, sketch DOF, appearance color, dialog OK, fillet chip R 2→3.
 * more40: MATERIALS+F70 控製→控制 + F69 運動連結, draft angle, shell thickness-0 commit, pipe wall≥R,
 * circpattern count, scale factor 0/×2, combine empty, measure distance Formal, undo fillet→chamfer,
 * surfextrude empty.
 * Focus here: assembly joint-move refuse · pathpattern count · rect spacing-0 · shell empty-pick ·
 * sweep end-scale · thicken quilt 0 · measure area/length Formal · F74–F77 Formal always-hard.
 * Always-hard: MATERIALS SC keep + F77 以關節連結 + F76 複用/預設組件中心 + F75 tip.jointorigin
 * 可複用/以關節連結 + F74 轉動／滑動軸/其連結的組件.
 * Hand-off: FISHING79 cherry (F78 tip already shipped when soft-prep finished).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 0)

const { loadFont } = await import('replicad')
const fontBuf = readFileSync(new URL('../src/fonts/Roboto-Regular.ttf', import.meta.url))
await loadFont(
  fontBuf.buffer.slice(fontBuf.byteOffset, fontBuf.byteOffset + fontBuf.byteLength),
  'cad',
  true,
)

const { useApp, MATERIALS } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')
const { featDlgBlockingReason, featDlgSemanticReason } = await import('../src/cad/featDlgNumeric.ts')
const { combineMeasure } = await import('../src/cad/measureCombine.ts')
const { parseSweepScaleDraft } = await import('../src/cad/sweepTwistFields.ts')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')
const { planComponentMove } = await import('../src/assembly/componentMove.ts')
const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () =>
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const volSTEP = async () => {
  const buf = await w.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try {
    return measureVolume(shape)
  } finally {
    shape.delete()
  }
}
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const near = (a, b, t = 1) => Math.abs(a - b) < t

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const comp = (id, name, extra = {}) => ({
  id,
  name,
  mesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2], normals: [] },
  pos: [0, 0, 0],
  rot: [0, 0, 0],
  color: '#888',
  ...extra,
})
const J = (id, type, parent, child, axis = [0, 1, 0]) => ({
  id,
  name: id,
  type,
  parent,
  child,
  anchor: [0, 10, 0],
  axis,
  angle: 0,
  slide: 0,
})

// ── always-hard: MATERIALS + F77 / F76 / F75 / F74 ──

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
  assert.ok(MATERIALS['钢'], 'SC key 钢 must exist on MATERIALS')
})

test('always-hard: FISHING77 componentMove refuse uses 以關節…連結 not 連接', () => {
  const cm = rd('src/assembly/componentMove.ts')
  assert.match(cm, /以關節「\$\{jn\(j0\)\}」連結 —/)
  assert.match(cm, /以關節「\$\{jn\(j0\)\}」連結到已固定的/)
  assert.match(cm, /以關節（任一方向）連結嘅組件集合/)
  assert.doesNotMatch(cm, /以關節「\$\{jn\(j0\)\}」連接/)
  assert.doesNotMatch(cm, /連接到已固定的/)
})

test('always-hard: FISHING76 Formal 複用 / 預設組件中心 / 可複用', () => {
  const vp = rd('src/components/Viewport.tsx')
  const st = rd('src/store.ts')
  const bt = rd('src/components/BrowserTree.tsx')
  const jp = rd('src/components/JointsPanel.tsx')
  assert.match(vp, /複用模態振型動畫/)
  assert.doesNotMatch(vp, /復用模態振型動畫/)
  assert.match(st, /取代預設組件中心/)
  assert.match(bt, /取代預設組件中心/)
  assert.match(jp, /父件：預設組件中心/)
  assert.match(st, /可複用命名幀/)
  assert.doesNotMatch(st, /可復用/)
  assert.doesNotMatch(st, /取代預設件心/)
  assert.doesNotMatch(jp, /父件：預設件心/)
})

test('always-hard: FISHING75 tip.jointorigin 可複用 + 以關節連結 (move-with-joints)', () => {
  const hk = rd('src/i18n/locales/zh-HK.ts')
  const rb = rd('src/ribbon.ts')
  const st = rd('src/store.ts')
  const bt = rd('src/components/BrowserTree.tsx')
  const jp = rd('src/components/JointsPanel.tsx')
  const cm = rd('src/assembly/componentMove.ts')
  assert.match(hk, /tip\.jointorigin.*可複用命名幀/)
  assert.match(rb, /可複用命名幀/)
  assert.doesNotMatch(hk, /可復用/)
  assert.match(st, /落一個可複用命名幀/)
  assert.match(st, /已建可複用「/)
  assert.match(bt, /可複用關節原點/)
  assert.match(jp, /可複用關節原點/)
  assert.match(st, /以關節連結的/)
  assert.doesNotMatch(st, /以關節連接的/)
  assert.match(cm, /以關節連結/)
  for (const s of [st, bt, jp]) assert.doesNotMatch(s, /可復用/)
})

test('always-hard: FISHING74 joint-pick Formal 轉動／滑動軸 + 其連結的組件', () => {
  const st = rd('src/store.ts')
  assert.match(st, /圓柱＝轉動／滑動關節／圓柱/)
  assert.match(st, /圓柱↔平面＝轉動／滑動軸取自圓柱並穿面心，預設轉動/)
  assert.match(st, /其連結的組件（父件）/)
  assert.doesNotMatch(st, /其連接的組件/)
  assert.match(st, /轉動／滑動軸將取自已選圓柱面/)
})

// ── assembly joint-move refuse (≠ more35 move cancel; F77 Formal pin at runtime) ──

test('runtime: planComponentMove jointed-to-grounded refuse Formal 以關節連結; slider drives', () => {
  const C = [comp('P', '組件1', { grounded: true }), comp('S', '組件2')]
  const rev = [J('J1', 'revolute', 'P', 'S')]
  const r = planComponentMove(['S'], [5, 0, 0], [0, 0, 0], C, rev)
  assert.equal(r.kind, 'refuse')
  assert.match(r.msg, /以關節「J1」連結到已固定的「組件1」— 直接移動會令其脫離關節軸線/)
  assert.doesNotMatch(r.msg, /連接/)
  assert.doesNotMatch(r.msg, COLLOQ)

  const sl = [J('J1', 'slider', 'P', 'S', [1, 0, 0])]
  assert.deepEqual(planComponentMove(['S'], [7, 0, 0], [0, 0, 0], C, sl), {
    kind: 'drive',
    jointId: 'J1',
    slide: 7,
    compId: 'S',
  })
  const off = planComponentMove(['S'], [7, 3, 0], [0, 0, 0], C, sl)
  assert.equal(off.kind, 'refuse')
  assert.match(off.msg, /只可沿關節「J1」的滑動軸移動/)
})

// ── pathpattern count gate (not in more34–40 samples) ──

test('runtime: pathpattern count 0/1 Formal refuse; dialog stays; no pathpattern feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  useApp.setState({
    featDlg: {
      kind: 'pathpattern',
      params: { count: 1, target: 'body', orient: 'identical' },
      payload: { path: [[0, 0], [40, 0], [40, 30]] },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /路徑陣列：數量至少為 2/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /路径阵列|数量至少/)
  assert.ok(g().featDlg, 'dialog stays open on refuse')
  assert.deepEqual(g().features, before)
  assert.equal(g().features.some((f) => f.type === 'pathpattern'), false)
  assert.ok(near(await volSTEP(), v0, 1e-3))

  g().setFeatParam('count', 0, '0')
  await g().commitFeatDlg()
  assert.match(g().status, /路徑陣列：數量至少為 2/)
  assert.deepEqual(g().features, before)
})

// ── rect pattern spacing dx=0 (≠ more37 count gate / more40 circ count) ──

test('runtime: rect pattern dx=0 countX=3 Formal 間距 refuse; features/volume unchanged', async () => {
  const bad = featDlgSemanticReason({
    kind: 'pattern',
    params: { countX: 3, countY: 1, countZ: 1, dx: 0, dy: 20, dz: 0, dtype: 'spacing' },
  })
  assert.match(bad || '', /間距不可為 0/)
  assert.doesNotMatch(bad || '', COLLOQ)
  assert.equal(
    featDlgSemanticReason({
      kind: 'pattern',
      params: { countX: 3, countY: 1, countZ: 1, dx: 25, dy: 0, dz: 0, dtype: 'spacing' },
    }),
    null,
  )

  reset()
  const PLATE = { id: 'P', type: 'prim', shape: 'box', a: 100, b: 50, c: 10, op: 'new', cornerOrigin: true }
  const HOLE = {
    id: 'H',
    type: 'extrude',
    profile: { kind: 'circle', c: [15, 25], r: 4 },
    height: 10,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([PLATE, HOLE], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  g().selectFeature('H')
  g().openFeatDlg('pattern')
  g().setFeatParam('countX', 3)
  g().setFeatParam('countY', 1)
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 20)
  const block = featDlgBlockingReason(g().featDlg)
  assert.match(block || '', /間距不可為 0/)
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：.*間距不可為 0|間距不可是 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open')
  assert.deepEqual(g().features, before)
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── shell empty-pick refuse (≠ more40 shell thickness-0 / more38 oversize) ──

test('runtime: open shell no face pick → Formal 請先選擇要移除的面; tree/volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  g().toggleShell()
  assert.equal(g().shellMode, true)
  assert.equal(g().shellType, 'open')
  assert.deepEqual(g().shellPicks, [])
  g().setShellThickness(2)
  await g().commitShell()
  assert.match(g().status, /^請先選擇要移除的面$/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请先选择要移除的面/)
  assert.equal(g().shellMode, true, 'mode stays open so user can pick')
  assert.deepEqual(g().features, before)
  assert.equal(g().features.some((f) => f.type === 'shell'), false)
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── sweep end-scale 0 Formal (≠ more34 Ø=0 / more40 pipe wall) ──

test('runtime: sweep end-scale 0/neg/blank Formal refuse; setSweepScale keeps prior', () => {
  for (const bad of ['0', '-1', '-0.5', '', 'abc']) {
    const r = parseSweepScaleDraft(bad)
    assert.equal(r.ok, false, `expected refuse for ${JSON.stringify(bad)}`)
    assert.ok(isIllegalRejectStatus(r.reason), r.reason)
    assert.match(r.reason || '', /尺寸已拒絕/)
    assert.match(r.reason || '', /末端縮放/)
    assert.doesNotMatch(r.reason || '', COLLOQ)
    assert.doesNotMatch(r.reason || '', /末端缩放|尺寸已拒绝/)
  }
  const ok = parseSweepScaleDraft('0.5')
  assert.equal(ok.ok, true)
  assert.equal(ok.value, 0.5)

  useApp.setState({ ...useApp.getInitialState(), sweepScale: 1, lang: 'zh-HK' }, true)
  g().setSweepScale(0)
  assert.equal(g().sweepScale, 1, '0 must not write (keep prior 1)')
  g().setSweepScale(-3)
  assert.equal(g().sweepScale, 1)
  g().setSweepScale(0.25)
  assert.equal(g().sweepScale, 0.25)
  g().setSweepScale(0)
  assert.equal(g().sweepScale, 0.25, 'after legal 0.25, 0 still keeps prior')
})

// ── thicken quilt thick 0 (≠ more36/37 face thicken 0/99999) ──

test('runtime: thickenParkedAt thick 0 → Formal 加厚曲面 refuse; no thickenquilt', async () => {
  reset()
  const feats = [
    { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true },
    { id: 'OS', type: 'offsetsurf', near: [20, 15, 10], dist: 2 },
  ]
  assert.equal(await g().applyFeatures(feats, 'box+offsetsurf'), true, g().status)
  const parked = g().bodyMesh?.parked ?? []
  assert.ok(parked.length >= 1, `need parked offset surface; status=${g().status}`)
  const before = structuredClone(g().features)
  useApp.setState({
    quiltPickMode: true,
    appPrompt: async () => '0',
  })
  await g().thickenParkedAt(0)
  assert.match(g().status, /加厚曲面：厚度必須為非零數值/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().quiltPickMode, false, 'mode cleared after refuse')
  assert.equal(g().features.some((f) => f.type === 'thickenquilt'), false)
  assert.deepEqual(g().features, before)
})

// ── measure area/length Formal (≠ more40 measure distance 軸距／夾角) ──

test('hard: measure area／稜長 Formal TC labels (not SC 面积/长度)', () => {
  const area = combineMeasure([{ kind: 'face', area: 1200, surfType: 'PLANE' }])
  assert.equal(area.type, 'area')
  assert.equal(area.label, '面積')
  assert.equal(area.valueUnit, 'area')
  assert.doesNotMatch(area.label, /面积/)
  assert.doesNotMatch(area.label, COLLOQ)

  const edge = combineMeasure([{ kind: 'edge', length: 40 }])
  assert.equal(edge.type, 'length')
  assert.equal(edge.label, '稜長')
  assert.equal(edge.valueUnit, 'len')
  assert.equal(edge.value, 40)
  assert.doesNotMatch(edge.label, /棱长|长度/)
  assert.doesNotMatch(edge.label, COLLOQ)

  const cyl = combineMeasure([{ kind: 'face', area: 942.48, radius: 5, surfType: 'CYLINDRE' }])
  assert.equal(cyl.type, 'length')
  assert.match(cyl.label, /圓柱面直徑Ø/)
  assert.equal(cyl.value, 10)
  assert.doesNotMatch(cyl.label, /圆柱面直径/)
})
