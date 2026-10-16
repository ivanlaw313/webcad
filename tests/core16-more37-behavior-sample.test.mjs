/**
 * BOT-D more37 / FISHING58+ — CORE16 true behavior / regression gaps on tip 14c8d2f.
 * Complements smoke-21 + more34 + more35 + more36 samples without duplicating those topics.
 * more34: box/cyl-cut vol, revolve/sweep refuse, refuse→360, fillet-then-refuse, MATERIALS+F54.
 * more35: MATERIALS+F54, copy independence, boolean cut, shell→fillet, split sum,
 * pattern-after-cut, hole csink, move cancel, emboss refuse, undo two-step.
 * more36: MATERIALS, F56 趨勢著色, hide/rebuild, arb through, chamfer two-dist, loft thin-wall,
 * thicken 99999, timeline reorder, pushpull, cyl/cone vol, importStep garbage.
 * Focus here: box dims0 · cyl/cone h0 · fillet R gate · hole Ø gate · pattern dx0 ·
 * extrude through-cut vol · chamfer dist2=0 · thicken 0/oversize · timeline-chip legal size.
 * Always-hard: MATERIALS SC keep + FISHING58 Formal 匯入 (not 導入).
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
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')
const { featDlgBlockingReason, featDlgSemanticReason } = await import('../src/cad/featDlgNumeric.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
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
const BOX40 = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 40, c: 40, op: 'new', cornerOrigin: true }
const BOX_VOL = 40 * 30 * 20 // 24000
const FILLET_R2 = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }
const PLATE = { id: 'P', type: 'prim', shape: 'box', a: 100, b: 50, c: 10, op: 'new', cornerOrigin: true }
const HOLE_CUT = {
  id: 'H',
  type: 'extrude',
  profile: { kind: 'circle', c: [15, 25], r: 4 },
  height: 10,
  plane: 'XY',
  baseZ: 0,
  through: true,
  operation: 'cut',
}

// ── always-hard: MATERIALS + FISHING58 Formal 匯入 ───────────────

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('always-hard: FISHING58 Formal 匯入 present on key import/refuse paths; 導入 absent', () => {
  const st = rd('src/store.ts')
  const im = rd('src/cad/insertModel.ts')
  assert.match(im, /請拆分圖層或簡化後匯入/)
  assert.doesNotMatch(im, /簡化後導入/)
  assert.match(st, /繼續匯入？`, '大型網格匯入'/)
  assert.match(st, /繼續匯入？`, '大型 OBJ 匯入'/)
  assert.match(st, /繼續匯入？`, '大型 3MF 匯入'/)
  assert.match(st, /已匯入 STEP 為 B-rep 實體/)
  assert.match(st, /STEP B-rep 匯入失敗/)
  assert.match(st, /已匯入 DXF：\$\{note\}/)
  assert.match(st, /已匯入 SVG：\$\{note\}/)
  assert.match(st, /僅匯入為草圖/)
  assert.doesNotMatch(st, /繼續導入？/)
  assert.doesNotMatch(st, /已導入 STEP/)
  assert.doesNotMatch(st, /已導入 DXF/)
  assert.doesNotMatch(st, /已導入 SVG/)
})

// ── box dims 0 Formal refuse; legal recovers ─────────────────────

test('runtime: box dims 0 Formal refuse (editFeature a/b/c); legal recovers', async () => {
  reset()
  const seed = { id: 'box1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }
  assert.equal(await g().applyFeatures([seed], '已建立長方體'), true, g().status)
  const before = structuredClone(g().features)

  for (const key of ['a', 'b', 'c']) {
    await g().editFeature('box1', { [key]: 0 })
    assert.ok(isIllegalRejectStatus(g().status), `${key}=0 status=${g().status}`)
    assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
    assert.doesNotMatch(g().status, COLLOQ)
    assert.deepEqual(g().features, before, `${key}=0 must not mutate`)
  }

  await g().editFeature('box1', { a: 90 })
  assert.equal(g().features.find((f) => f.id === 'box1')?.a, 90, g().status)
  assert.doesNotMatch(g().status, /尺寸已拒絕：尺寸必須大於 0/)
})

// ── cylinder / cone height 0 Formal refuse ───────────────────────

test('runtime: cylinder/cone height 0 Formal refuse; legal cylinder recovers', async () => {
  reset()
  useApp.setState({
    featDlg: { kind: 'cylinder', params: { d: 20, h: 0, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕|高度必須|必須大於/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(
    !g().features.some((f) => f.type === 'extrude' && f.profile?.kind === 'circle' && !f.sketchId),
    'no cylinder committed',
  )
  assert.ok(g().featDlg, 'featDlg should stay open after refuse')
  assert.equal(g().featDlg?.kind, 'cylinder')

  useApp.setState({
    featDlg: { kind: 'cone', params: { d: 20, dt: 0, h: 0, sides: 0, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕|高度必須大於 0|必須大於/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(!g().features.some((f) => f.type === 'prim' && f.shape === 'cone'), 'no cone committed')

  useApp.setState({
    featDlg: { kind: 'cylinder', params: { d: 16, h: 30, op: 'new', px: 0, py: 0, pz: 0 } },
  })
  await g().commitFeatDlg()
  const f = g().features.find((x) => x.type === 'extrude' && x.profile?.kind === 'circle' && !x.sketchId)
  assert.ok(f, g().status)
  assert.equal(f.height, 30)
  assert.equal(f.profile.r, 8)
  assert.equal(g().featDlg, null)
})

// ── fillet R=0 / oversize refuse; legal R decreases vol ──────────

test('runtime: fillet R=0 / oversize Formal refuse; legal R decreases volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX, FILLET_R2], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const vFillet = await volSTEP()
  await g().editFeature('F', { radius: 0 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕/)
  assert.match(g().status, /必須大於 0|大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.find((x) => x.id === 'F')?.radius, 2)
  assert.ok(near(await volSTEP(), vFillet, 1e-3), 'R=0 must not change volume')

  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, BOX_VOL, 1), `seed vol ${v0}`)
  const ok = await g().applyFeatures(
    [BOX, { id: 'Fhuge', type: 'fillet', radius: 999, edges: 'all' }],
    'oversize',
    true,
  )
  assert.equal(ok, false, g().status)
  assert.match(g().status, /圓角半徑太大|半徑.*過大|全稜倒圓角.*失敗|無法建立圓角|相對幾何過大/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.filter((f) => f.type === 'fillet').length, 0)
  assert.ok(near(await volSTEP(), v0, 1), `oversize must keep vol ${v0}`)

  assert.equal(await g().applyFeatures([BOX, FILLET_R2], 'fillet R2'), true, g().status)
  const v1 = await volSTEP()
  assert.ok(v1 < v0 - 10, `legal fillet must remove material: ${v0} → ${v1}`)
})

// ── hole Ø≤0 refuse; legal through decreases vol ─────────────────

test('runtime: hole Ø≤0 Formal refuse; legal through decreases volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({
    holeMode: true,
    holePos: [20, 10, 0],
    holeFaceZ: 20,
    holeD: 0,
    holeThrough: true,
    holeType: 'simple',
  })
  await g().commitHole()
  assert.match(g().status, /尺寸已拒絕：孔徑Ø必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before)
  assert.equal(g().holeMode, true, 'mode stays open so user can fix Ø')

  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, BOX_VOL, 1), `seed vol ${v0}`)
  const hole = {
    id: 'h1',
    type: 'hole',
    kind: 'simple',
    center: [20, 15],
    top: 20,
    diameter: 8,
    through: true,
    extent: 'through-all',
  }
  assert.equal(await g().applyFeatures([BOX, hole], 'legal hole'), true, g().status)
  const v1 = await volSTEP()
  const expectCut = Math.PI * 4 * 4 * 20
  assert.ok(v1 < v0 - expectCut * 0.5, `legal hole must reduce volume: ${v0} → ${v1}`)
  assert.ok(Math.abs(v1 - (v0 - expectCut)) < 5, `through Ø8 cut ≈ ${expectCut}, got Δ=${v0 - v1}`)
})

// ── pattern dx=0 countX>1 refuse; legal pattern reduces vol ──────

test('runtime: pattern dx=0 countX>1 Formal refuse; legal 3×1 reduces volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([PLATE, HOLE_CUT], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  const bad = featDlgSemanticReason({
    kind: 'pattern',
    params: { countX: 3, countY: 1, countZ: 1, dx: 0, dy: 20, dz: 0, dtype: 'spacing' },
  })
  assert.match(bad || '', /間距不可為 0/)
  assert.doesNotMatch(bad || '', COLLOQ)

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

  g().setFeatParam('dx', 30)
  g().setFeatParam('dy', 0)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.match(g().status, /已矩形陣列/)
  const v1 = await volSTEP()
  const oneHole = Math.PI * 16 * 10
  const expected = v0 - 2 * oneHole
  assert.ok(Math.abs(v1 - expected) < 5, `legal spacing volume ${v1} want ~${expected} (seed ${v0})`)
})

// ── extrude through-cut volume drops ≈ πr²·h ─────────────────────

test('runtime: extrude through-cut volume drops ≈ πr²·h', async () => {
  reset()
  const plate = {
    id: 'plate',
    type: 'extrude',
    profile: { kind: 'rect', a: [-30, -25], b: [30, 25] },
    height: 12,
    operation: 'new',
  } // 60×50×12 = 36000
  const hole = { kind: 'circle', c: [0, 0], r: 6 }
  const holeVol = Math.PI * 36 * 12
  assert.equal(await g().applyFeatures([plate], 'plate'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, 36000, 2), `seed ${v0}`)

  const ok = await g().applyFeatures(
    [
      ...g().features,
      { id: 'cut1', type: 'extrude', profile: hole, height: 0, operation: 'cut', through: true, baseZ: 12 },
    ],
    '已切割（布爾減）（貫通）',
  )
  assert.equal(ok, true, g().status)
  assert.doesNotMatch(g().status, /切割沒有|切割没有|體積沒有變化|体积没有变化/)
  const cut = g().features.find((f) => f.id === 'cut1')
  assert.ok(cut && cut.through === true && cut.operation === 'cut')
  const v1 = await volSTEP()
  assert.ok(v1 < v0, `volume must decrease: ${v1} < ${v0}`)
  assert.ok(near(v1, 36000 - holeVol, 3), `through-cut ${v1}`)
})

// ── chamfer dist2=0 refuse ───────────────────────────────────────

test('runtime: chamfer two-dist dist2=0 Formal refuse; no chamfer feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX40], 'seed'), true, g().status)
  const n0 = g().features.length
  const v0 = await volSTEP()
  // Top front edge mid (cornerOrigin): CAD (20,0,40) → three (20,40,0)
  useApp.setState({
    edgeRoundPick: 'chamfer',
    edgeRoundPicks: [[20, 40, 0]],
    edgeRoundPickLines: [],
    edgeRoundRadii: [],
    edgeRoundGroupIds: [],
    edgeRoundSize: 3,
    chamferMode: 'two',
    chamferSize2: 0,
    chamferAngle: 45,
    chamferFlip: false,
    chamferRefFace: null,
  })
  await g().commitEdgeRound()
  assert.match(g().status, /雙距離：距離 2 必須大於 0|距離 2 必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.length, n0)
  assert.equal(g().features.some((f) => f.type === 'chamfer'), false)
  assert.equal(g().edgeRoundPick, 'chamfer', 'mode stays so user can fix dist2')
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── thicken zero / oversize Formal refuse ────────────────────────

test('runtime: thicken thick 0 / 99999 Formal refuse; tree unchanged; legal 3 recovers', async () => {
  reset()
  const TOP = [20, 10, -15]
  assert.equal(await g().applyFeatures([{ ...BOX, c: 10 }], 'box'), true, g().status)
  g().toggleThicken()
  await g().thickenFaceAt(TOP)
  g().setThicken({ thick: 2 })
  await g().commitThicken()
  const f = g().features.find((x) => x.type === 'thickenface')
  assert.ok(f, g().status)
  const before = structuredClone(g().features)

  await g().editFeature(f.id, { thick: 0, side: 'pos' })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕/)
  assert.match(g().status, /必須大於 0|不可為 0|大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.find((x) => x.id === f.id)?.thick, 2)

  await g().editFeature(f.id, { thick: 99999, side: 'pos' })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /^尺寸已拒絕：加厚厚度 99999 mm/)
  assert.match(g().status, /過大|超過上限/)
  assert.doesNotMatch(g().status, /已更新參數並重建/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before)

  await g().editFeature(f.id, { thick: 3, side: 'pos' })
  assert.equal(g().features.find((x) => x.id === f.id)?.thick, 3, g().status)
})

// ── optional: timeline-chip legal size (revolve angle / wall 0) ───

test('runtime: timeline-chip legal revolve angle + wall 0 succeed (no false 尺寸必須大於 0)', async () => {
  reset()
  const rev = {
    id: 'rev1',
    type: 'revolve',
    profile: { kind: 'rect', a: [10, 0], b: [30, 20] },
    angle: 360,
    axis: 'Y',
    op: 'new',
  }
  assert.equal(await g().applyFeatures([rev], 'seed revolve'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(v0 > 1000, `seed volume ${v0}`)

  await g().editFeature('rev1', { angle: 180 })
  assert.doesNotMatch(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.equal(g().features.find((x) => x.id === 'rev1')?.angle, 180, g().status)

  await g().editFeature('rev1', { wall: 0 })
  assert.doesNotMatch(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.ok(!/尺寸已拒絕：尺寸必須大於 0/.test(g().status), `wall 0 must not trip length gate: ${g().status}`)
})
