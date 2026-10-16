/**
 * BOT-D more40 / FISHING70+ — CORE16 true behavior / regression gaps on tip d6c23b5.
 * Complements smoke-21 + more34–more39 samples without duplicating those topics.
 * more34: box/cyl-cut vol, revolve/sweep refuse, refuse→360, fillet-then-refuse, MATERIALS+F54.
 * more35: MATERIALS+F54, copy, boolean cut ΔV, shell→fillet, split, 2×1 pattern-after-cut, hole csink,
 * move cancel, emboss depth0, undo two-step (box→fillet→cut).
 * more36: MATERIALS, F56 趨勢著色, hide/rebuild, arb through, chamfer two-dist, loft thin-wall,
 * thicken 99999, timeline reorder, pushpull, cyl/cone vol, importStep garbage.
 * more37: MATERIALS, F58 匯入, box/cyl/cone 0, fillet/hole/pattern gate, extrude through-cut ≈πr²h,
 * chamfer dist2=0, thicken 0/99999, timeline-chip legal revolve/wall0.
 * more38: MATERIALS+F60 tip.joint, loft rail, loft <2 sections, emboss AB preview, extrude dist,
 * extrude cut-through, sketch dual-icon, 2×2 body pattern, b3 shell oversize/split miss.
 * more39: MATERIALS+F62 tip.align/tip.joint, revolve cut groove, mirror gate, emboss size0/neg,
 * cyl/cone timeline label, sketch DOF, appearance color, dialog OK, fillet chip R 2→3.
 * Focus here: draft angle gate · shell thickness-0 commit · pipe wall≥R refuse · circpattern count ·
 * scale factor 0 / ×2 · combine empty tool · measure distance Formal · undo fillet→chamfer ·
 * surfextrude empty · MATERIALS+F70 控製→控制 + F69 運動連結 always-hard.
 * Always-hard: MATERIALS SC keep + FISHING70 Formal 控製→控制 + FISHING69 運動連結/tip.jointorigin.
 * Hand-off: FISHING72 cherry (F70 tip shipped; F71 already online).
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
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')
const { parseField } = await import('../src/cad/numericInput.ts')
const { combineMeasure } = await import('../src/cad/measureCombine.ts')
const {
  ILLEGAL_THICKNESS_DETAIL,
  illegalRejectStatus,
  isIllegalRejectStatus,
} = await import('../src/ui/illegalInput.ts')
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
// ── always-hard: MATERIALS + FISHING70 控製→控制 + FISHING69 運動連結 ──

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
  assert.ok(MATERIALS['钢'], 'SC key 钢 must exist on MATERIALS')
})

test('always-hard: FISHING70 Formal tip.drivejoints / Form / editpoles / bspline use 控制 not 控製', () => {
  const hk = rd('src/i18n/locales/zh-HK.ts')
  const rb = rd('src/ribbon.ts')
  assert.match(hk, /"tip\.drivejoints": ".*播放控制驅動裝配。"/)
  assert.match(rb, /id: 'drivejoints'[^}]*?tip: '[^']*播放控制驅動裝配/)
  assert.match(rb, /id: 'formcyl'[^}]*?tip: '[^']*控制籠[^']*控制點/)
  assert.match(rb, /id: 'editpoles'[^}]*?tip: '[^']*控制點球/)
  assert.match(rb, /id: 'formsubdiv'[^}]*?tip: '[^']*控制籠細分級/)
  const m = rb.match(/id: 'sk_bspline'[^}]*?tip: '((?:\\'|[^'])*)'/)
  assert.ok(m, 'sk_bspline tip present')
  assert.match(m[1], /控制點/)
  assert.doesNotMatch(m[1], /控製/)
  assert.doesNotMatch(hk, /控製/)
  assert.doesNotMatch(rb, /控製/)
})

test('always-hard: FISHING69 Formal 運動連結 not 運動連接 + tip.jointorigin long', () => {
  const rb = rd('src/ribbon.ts')
  const hk = rd('src/i18n/locales/zh-HK.ts')
  const jp = rd('src/components/JointsPanel.tsx')
  assert.match(rb, /label: '運動連結'/)
  assert.match(hk, /"tool\.motionlink": "運動連結"/)
  assert.match(hk, /"cmd\.motionlink": "運動連結"/)
  assert.match(jp, /運動連結（齒輪比）/)
  assert.doesNotMatch(rb, /運動連接/)
  assert.doesNotMatch(jp, /運動連接/)
  const m = hk.match(/"tip\.jointorigin": "((?:\\"|[^"])*)"/)
  assert.ok(m)
  const tip = m[1].replace(/\\"/g, '"')
  assert.match(tip, /GM-3DV4 A1/)
  assert.match(tip, /可複用命名幀/)
  assert.match(tip, /關節原點/)
})

// ── draft angle gate / finishDraftPick refuse (≠ smoke draft analysis) ──

test('runtime: draft angle NaN/OOR Formal gate; finishDraftPick without neutral refuse', async () => {
  const abc = featDlgBlockingReason({
    kind: 'draft',
    params: { angle: NaN },
    paramRaw: { angle: 'abc' },
  })
  assert.match(abc || '', /拔模角/)
  assert.doesNotMatch(abc || '', COLLOQ)

  const oor = parseField('draftAngle', '90')
  assert.equal(oor.ok, false)
  assert.match(oor.reason || '', /拔模角/)

  const zero = parseField('draftAngle', '0')
  assert.equal(zero.ok, true, 'draft 0° is legal (= no draft)')
  assert.equal(zero.value, 0)

  assert.equal(
    featDlgBlockingReason({
      kind: 'draft',
      params: { angle: 10 },
      paramRaw: { angle: '10' },
    }),
    null,
  )

  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({ draftPickMode: 2, draftNeutral: null, draftSides: [], draftAngle: 10 })
  await g().finishDraftPick()
  assert.match(g().status, /請先點中性面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.some((f) => f.type === 'draft'), false)
})

// ── shell thickness 0 commit refuse (≠ more38 shellFailReason/oversize/split) ──

test('runtime: shell thickness 0 → Formal 壁厚必須大於 0; no shell feature', async () => {
  assert.equal(ILLEGAL_THICKNESS_DETAIL, '壁厚必須大於 0')
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  useApp.setState({
    shellMode: true,
    shellType: 'open',
    shellPicks: [[20, 15, 10]],
    shellThickness: 2,
  })
  g().setShellThickness(0)
  assert.equal(g().shellThickness, 0)
  assert.match(g().status, /尺寸已拒絕：壁厚必須大於 0/)
  assert.ok(isIllegalRejectStatus(g().status))
  await g().commitShell()
  assert.match(g().status, /尺寸已拒絕：壁厚必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /壁厚必须|尺寸已拒绝/)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.some((f) => f.type === 'shell'), false)
  assert.equal(g().shellMode, true, 'shell mode stays open so user can fix thickness')
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── pipe hollow wall ≥ outer R refuse (≠ more38 loft / more36 pushpull) ──

test('runtime: pipe hollow wall ≥ outer radius Formal refuse; no sweep feature', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({
    featDlg: {
      kind: 'pipe',
      params: { section: 'circular', size: 10, hollow: 1, thickness: 6, dist: 1, op: 'new' },
      payload: { path: [[0, 0], [40, 0], [40, 30]], smooth: false },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /管道：壁厚過大（≥外半徑）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /壁厚过大|管道:壁厚/)
  assert.ok(g().featDlg, 'dialog stays open on refuse')
  assert.deepEqual(g().features, before)
  assert.equal(g().features.some((f) => f.type === 'sweep'), false)
})

// ── circular pattern count 0/1 refuse + legal ×3 (not in more34–39 samples) ──

test('runtime: circpattern count 0/1 Formal refuse; count=3 legal applies', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  assert.ok(near(v0, 40 * 30 * 20, 1), `seed ${v0}`)

  assert.match(
    featDlgBlockingReason({ kind: 'circpattern', params: { count: 1 } }) || '',
    /環形陣列數量必須是不小於 2 的整數/,
  )
  assert.equal(featDlgBlockingReason({ kind: 'circpattern', params: { count: 4 } }), null)

  g().openFeatDlg('circpattern')
  for (const bad of [0, 1]) {
    g().setFeatParam('count', bad, String(bad))
    await g().commitFeatDlg()
    assert.match(g().status, /環形陣列數量必須是不小於 2|數量至少為 2|非法|陣列數量：最小 1/)
    assert.doesNotMatch(g().status, COLLOQ)
    assert.ok(g().featDlg)
    assert.deepEqual(g().features, before)
  }

  g().setFeatParam('count', 3, '3')
  g().setFeatParam('mode', 'full')
  g().setFeatParam('totalAngle', 360)
  g().setFeatParam('ox', 0)
  g().setFeatParam('oy', 0)
  g().setFeatParam('oz', 0)
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 0)
  g().setFeatParam('dz', 1)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.ok(
    g().features.some((f) => f.type === 'circPattern' || f.type === 'circpattern' || f.type === 'cpattern'),
    g().status,
  )
  const v1 = await volSTEP()
  assert.ok(Math.abs(v1 - v0) > 1 || v1 > v0 * 1.5, `legal circ count must apply: ${v0} → ${v1}`)
})

// ── scale factor 0 refuse + legal ×2 volume ×8 ──

test('runtime: scale factor 0 Formal refuse; ×2 grows volume ≈8×', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  assert.ok(near(v0, 40 * 30 * 20, 1), `seed ${v0}`)

  g().openFeatDlg('scale')
  g().setFeatParam('factor', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /比例要大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on factor-0 refuse')
  assert.deepEqual(g().features, before)
  assert.ok(near(await volSTEP(), v0, 1e-3))

  g().setFeatParam('factor', 2)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.ok(g().features.some((f) => f.type === 'scale' && f.factor === 2), g().status)
  assert.match(g().status, /已縮放 ×2/)
  assert.doesNotMatch(g().status, COLLOQ)
  const v1 = await volSTEP()
  assert.ok(near(v1, v0 * 8, 5), `×2 scale volume ${v0} → ${v1} (want ~${v0 * 8})`)
})

// ── combine empty tool refuse (≠ more35 boolean cut ΔV) ──

test('runtime: combine with no tool checked Formal refuse; no bodyboolean', async () => {
  reset()
  const BOX1 = { id: 'b1', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
  const PARK = { id: 'nb', type: 'newbody', name: '實體1' }
  const BOX2 = { id: 'b2', type: 'prim', shape: 'box', a: 20, b: 20, c: 10, op: 'new', cornerOrigin: true }
  assert.equal(await g().applyFeatures([BOX1, PARK, BOX2], 'two bodies'), true, g().status)
  assert.ok((g().bodyMesh?.parked?.length ?? 0) >= 1, 'need parked tool body')
  const before = structuredClone(g().features)

  g().openCombineDlg()
  assert.equal(g().featDlg?.kind, 'combine')
  g().setFeatParam('tool0', 0)
  g().setFeatParam('op', 'fuse')
  await g().commitFeatDlg()
  assert.match(g().status, /合併：至少勾選一個工具體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /合并：至少|至少勾选/)
  assert.equal(g().featDlg?.kind, 'combine', 'dialog stays open on refuse')
  assert.deepEqual(g().features, before)
  assert.ok(!g().features.some((f) => f.type === 'bodyboolean'))
})

// ── measure distance Formal path (≠ area/length smoke) ──

test('hard: measure distance Formal 軸距／厚度（面距）／最短距離 (not SC)', () => {
  const ax = combineMeasure(
    [
      { kind: 'face', surfType: 'CYLINDRE', axisO: [0, 0, 0], axisD: [0, 0, 1], radius: 4 },
      { kind: 'face', surfType: 'CYLINDRE', axisO: [30, 0, 0], axisD: [0, 0, 1], radius: 4 },
    ],
    { faceMinDist: 22 },
  )
  assert.equal(ax.type, 'distance')
  assert.match(ax.label, /軸距（平行軸）/)
  assert.ok(near(ax.value, 30, 1e-6))
  assert.doesNotMatch(ax.label, /轴距/)
  assert.doesNotMatch(ax.label, COLLOQ)

  const thick = combineMeasure([
    { kind: 'face', planeO: [0, 0, 10], planeN: [0, 0, 1], normal: [0, 0, 1] },
    { kind: 'face', planeO: [5, 5, 0], planeN: [0, 0, -1], normal: [0, 0, -1] },
  ])
  assert.equal(thick.type, 'distance')
  assert.match(thick.label, /厚度（面距）/)
  assert.ok(near(thick.value, 10, 1e-6))
  assert.doesNotMatch(thick.label, /厚度\(面距\)/)
  assert.doesNotMatch(thick.label, COLLOQ)

  // Non-parallel cylinders → Formal 最短距離 (perpendicular planes return 夾角, not distance)
  const skew = combineMeasure(
    [
      { kind: 'face', surfType: 'CYLINDRE', axisO: [0, 0, 0], axisD: [0, 0, 1], radius: 4 },
      { kind: 'face', surfType: 'CYLINDRE', axisO: [10, 0, 0], axisD: [1, 0, 0], radius: 4 },
    ],
    { faceMinDist: 4 },
  )
  assert.equal(skew.type, 'distance')
  assert.match(skew.label, /最短距離/)
  assert.ok(near(skew.value, 4, 1e-6))
  assert.doesNotMatch(skew.label, /最短距离/)
  assert.doesNotMatch(skew.label, COLLOQ)

  const ang = combineMeasure([
    { kind: 'face', planeO: [0, 0, 0], planeN: [1, 0, 0], normal: [1, 0, 0] },
    { kind: 'face', planeO: [0, 0, 0], planeN: [0, 1, 0], normal: [0, 1, 0] },
  ])
  assert.equal(ang.type, 'angle')
  assert.equal(ang.label, '夾角')
  assert.doesNotMatch(ang.label, /夹角/)
  assert.doesNotMatch(ang.label, COLLOQ)

  const src = rd('src/cad/measureCombine.ts')
  assert.match(src, /軸距（平行軸）/)
  assert.match(src, /厚度（面距）/)
  assert.match(src, /最短距離/)
  assert.doesNotMatch(src, /label: '轴距/)
  assert.doesNotMatch(src, /label: '最短距离/)
  assert.doesNotMatch(src, /轴距（平行轴）/)
})

// ── undo after fillet then chamfer volume path (≠ more35 box→fillet→cut) ──

test('runtime: undo after fillet→chamfer restores volume stepwise', async () => {
  reset()
  // Distinct edge nears so chamfer still finds a sharp edge after fillet (≠ edges:'all' then chamfer)
  const fillet = { id: 'F', type: 'fillet', radius: 2, nears: [[40, 15, 10]], chain: false }
  const chamfer = {
    id: 'C',
    type: 'chamfer',
    distance: 1.5,
    nears: [[0, 15, 10]],
    cmode: 'equal',
    chain: false,
  }

  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const vBox = await volSTEP()
  assert.ok(near(vBox, 40 * 30 * 20, 1), `box ${vBox}`)

  assert.equal(await g().applyFeatures([BOX, fillet], 'fillet'), true, g().status)
  const vFillet = await volSTEP()
  assert.ok(vFillet < vBox - 1, `fillet shrinks ${vBox} → ${vFillet}`)

  assert.equal(await g().applyFeatures([BOX, fillet, chamfer], 'chamfer'), true, g().status)
  const vChamfer = await volSTEP()
  assert.ok(vChamfer < vFillet - 0.5, `chamfer further shrinks ${vFillet} → ${vChamfer}`)
  assert.ok(g().features.some((f) => f.type === 'fillet'))
  assert.ok(g().features.some((f) => f.type === 'chamfer'))

  await g().undo()
  assert.ok(near(await volSTEP(), vFillet, 2), '1st undo → fillet vol')
  assert.equal(g().features.some((f) => f.type === 'chamfer'), false)
  await g().undo()
  assert.ok(near(await volSTEP(), vBox, 2), '2nd undo → box vol')
  assert.equal(g().features.some((f) => f.type === 'fillet'), false)
})

// ── surfextrude empty sketch refuse ──

test('runtime: surfextrude without sketch Formal refuse; no surfextrude feature', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ mode: 'model', sketchShape: null, sketchProfiles: [] })
  await g().addSurfExtrude()
  assert.match(g().status, /曲面拉伸：先畫一個截面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲面拉伸：先画|先畫一个/)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.some((f) => f.type === 'surfextrude'), false)
})
