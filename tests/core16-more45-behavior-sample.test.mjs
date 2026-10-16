/**
 * BOT-D more45 / FISHING88+ — CORE16 true behavior / regression gaps on tip d7ce4ce7.
 * Complements smoke-21 + more34–more44 samples without duplicating those topics.
 * more34: box/cyl-cut vol, revolve/sweep refuse, refuse→360, fillet-then-refuse, MATERIALS+F54.
 * more35: MATERIALS+F54, copy, boolean cut ΔV, shell→fillet, split, 2×1 pattern-after-cut, hole csink,
 * move cancel, emboss depth0, undo two-step (box→fillet→cut).
 * more36: MATERIALS, F56 趨勢著色, hide/rebuild, arb through, chamfer two-dist, loft thin-wall,
 * thicken 99999, timeline reorder success, pushpull, cyl/cone vol, importStep garbage.
 * more37: MATERIALS, F58 匯入, box/cyl/cone 0, fillet/hole/pattern gate, extrude through-cut ≈πr²h,
 * chamfer dist2=0, thicken 0/99999, timeline-chip legal revolve/wall0.
 * more38: MATERIALS+F60 tip.joint, loft rail success, loft <2 sections, emboss AB preview, extrude dist,
 * extrude cut-through, sketch dual-icon, 2×2 body pattern, b3 shell/split.
 * more39: MATERIALS+F62 tip.align/tip.joint, revolve cut groove, mirror gate, emboss size0/neg,
 * cyl/cone timeline label, sketch DOF, appearance color, dialog OK, fillet chip R 2→3.
 * more40: MATERIALS+F70 控製→控制 + F69 運動連結, draft angle, shell thickness-0, pipe wall≥R,
 * circpattern count, scale factor 0/×2, combine empty, measure distance, undo fillet→chamfer,
 * surfextrude empty.
 * more41: MATERIALS+F77/76/75/74, planComponentMove, pathpattern count 0/1, rect dx=0, shell empty-pick,
 * sweep end-scale, thicken quilt thick 0, measure area／稜長.
 * more42: MATERIALS+F81/79/78, pathpattern empty/cap>100, offsetsurf dist 0, hole csAngle clamp,
 * revolve cross-axis, loft rail no-open-poly, thicken missing, measure 軸線夾角, setPhysicalMaterial,
 * reorder dependency refuse, setFeaOpt/clearFea.
 * more43: MATERIALS+F85/F83, coil dim-0, move-zero, wrap-empty, rib-empty, pipe-empty, offsetsolid-0,
 * torus-self, gear-module-0, ithread-gate, split-blank, moveface-nopick, measure-volume, mate-cancel.
 * more44: MATERIALS+F85/F86, emboss empty/noface, scale-aniso, circpattern axis/faces, geopattern,
 * delface, tube-wall, rack-0, pyramid-0, ruled, sheetmetal-t0, clearFeaLoad.
 * Focus here: sphere/wedge/halfcyl dim-0 · pulley Ø0 · rtube wall≥half · profile wall≥section ·
 * gearbox ratio<1 · automatedmodel empty · surfloft empty · rect Face Pattern nopick ·
 * revolve wall<0 · cone dt<0 · cpattern count1.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F86 WindTunnel lazy guard.
 * Hand-off: FISHING90 cherry (more44 → F89; F88 tip is product base; do NOT target F89).
 * Formal chrome scan: NO.
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

const { useApp, MATERIALS, featDlgBlockingReason } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')
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

// ── always-hard: MATERIALS + F88 / F86 ──

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
  assert.ok(MATERIALS['钢'], 'SC key 钢 must exist on MATERIALS')
})

test('always-hard: FISHING88 lazySafe panel chunks + draft Formal 无法开模／無法開模', () => {
  const app = rd('src/App.tsx')
  const i18n = rd('src/i18n.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(app, /function lazySafe\(/)
  assert.match(app, /typeof C === 'function'/)
  assert.match(app, /LazyChunkFallback/)
  assert.match(app, /const HelpPanelLazy = lazySafe\(/)
  assert.match(app, /const PhysicsLab = lazySafe\(/)
  assert.match(app, /const AeroLab = lazySafe\(/)
  assert.doesNotMatch(app, /const HelpPanelLazy = lazy\(\(\) => import/)
  assert.match(i18n, /'倒扣（无法开模）'/)
  assert.match(i18n, /'倒扣（無法開模）'/)
  assert.doesNotMatch(i18n, /无法开启模/)
  assert.doesNotMatch(i18n, /倒扣 undercut/)
  assert.match(vp, /倒扣（無法開模）/)
})

test('always-hard: FISHING86 WindTunnelGpuLazy + WindObjectGizmoLazy guard missing default', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /const WindTunnelGpuLazy = lazy\(async \(\) =>/)
  assert.match(vp, /import\('\.\/WindTunnelGpu'\)/)
  assert.match(vp, /typeof C === 'function'/)
  assert.match(vp, /WindTunnelGpuChunkFallback/)
  assert.doesNotMatch(vp, /const WindTunnelGpuLazy = lazy\(\(\) => import\('\.\/WindTunnelGpu'\)\)/)
  assert.match(vp, /const WindObjectGizmoLazy = lazy\(async \(\) =>/)
  assert.match(vp, /WindObjectGizmoChunkFallback/)
  assert.doesNotMatch(vp, /const WindObjectGizmoLazy = lazy\(\(\) => import\('\.\/WindObjectGizmo'\)\)/)
  assert.match(vp, /FISHING35: React\.lazy does module\.default/)
})

// ── sphere dim-0 (≠ more37 box/cyl/cone 0) ──

test('runtime: sphere d=0 Formal 尺寸已拒絕; no sphere prim', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('sphere')
  g().setFeatParam('d', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /尺寸必须大于 0|尺寸已拒绝/)
  assert.ok(g().featDlg, 'dialog stays open on sphere refuse')
  assert.equal(g().features.some((f) => f.type === 'prim' && f.shape === 'sphere'), false)
  assert.deepEqual(g().features, before)
})

// ── wedge dim-0 (≠ more37 box 0 / more44 pyramid-0) ──

test('runtime: wedge l=0 Formal 尺寸已拒絕; no wedge prim', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('wedge')
  g().setFeatParam('l', 0)
  g().setFeatParam('w', 40)
  g().setFeatParam('h', 40)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on wedge refuse')
  assert.equal(g().features.some((f) => f.type === 'prim' && f.shape === 'wedge'), false)
  assert.deepEqual(g().features, before)
})

// ── halfcyl dim-0 (≠ more37 cyl 0) ──

test('runtime: halfcyl d=0 Formal 尺寸已拒絕; no halfcyl prim', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('halfcyl')
  g().setFeatParam('d', 0)
  g().setFeatParam('h', 40)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on halfcyl refuse')
  assert.equal(g().features.some((f) => f.type === 'prim' && f.shape === 'halfcyl'), false)
  assert.deepEqual(g().features, before)
})

// ── pulley Ø0 (≠ more43 gear-module-0 / more44 rack-0) ──

test('runtime: pulley diameter 0 Formal 外径 refuse; no pulley feature', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('pulley')
  g().setFeatParam('diameter', 0)
  g().setFeatParam('width', 18)
  g().setFeatParam('bore', 8)
  await g().commitFeatDlg()
  assert.match(g().status, /外径 要大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on pulley refuse')
  assert.equal(g().features.some((f) => f.type === 'pulley'), false)
  assert.deepEqual(g().features, before)
})

// ── rtube wall ≥ half (≠ more44 tube-wall ≥外半徑 / more40 pipe wall≥R) ──

test('runtime: rtube wall ≥ half section Formal refuse; no rtube extrude', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('rtube')
  g().setFeatParam('w', 40)
  g().setFeatParam('d', 40)
  g().setFeatParam('h', 60)
  g().setFeatParam('wall', 25)
  await g().commitFeatDlg()
  assert.match(g().status, /壁厚過大（≥半個截面）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /壁厚过大|≥半个截面|≥外半徑/)
  assert.ok(g().featDlg, 'dialog stays open on rtube wall refuse')
  assert.deepEqual(g().features, before)
})

// ── profile wall ≥ section (≠ more44 tube / more45 rtube) ──

test('runtime: profile t ≥ min(W,H) Formal refuse; no profile extrude', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('profile')
  g().setFeatParam('w', 40)
  g().setFeatParam('h', 40)
  g().setFeatParam('t', 40)
  g().setFeatParam('len', 100)
  await g().commitFeatDlg()
  assert.match(g().status, /壁厚過大（≥截面尺寸）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /壁厚过大（≥截面尺寸）|壁厚过大/)
  assert.ok(g().featDlg, 'dialog stays open on profile wall refuse')
  assert.deepEqual(g().features, before)
})

// ── gearbox ratio <1 (≠ more43 gear-module-0) ──

test('runtime: gearbox ratio <1 Formal refuse; no gear train', async () => {
  reset()
  const before = structuredClone(g().features)
  const beforeComps = structuredClone(g().components)
  g().openFeatDlg('gearbox')
  g().setFeatParam('ratio', 0.5)
  await g().commitFeatDlg()
  assert.match(g().status, /目標速比要 ≥1/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /目标速比/)
  assert.ok(g().featDlg, 'dialog stays open on gearbox refuse')
  assert.deepEqual(g().features, before)
  assert.deepEqual(g().components, beforeComps)
})

// ── automatedmodel empty picks (≠ more44 emboss-noface) ──

test('runtime: automatedmodel without 2 face picks Formal refuse; no automatedmodel', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('automatedmodel')
  g().setFeatParam('radius', 6)
  await g().commitFeatDlg()
  assert.match(g().status, /Automated Modeling：請在畫布選取兩張平面面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on automatedmodel refuse')
  assert.equal(g().features.some((f) => f.type === 'automatedmodel'), false)
  assert.deepEqual(g().features, before)
})

// ── surfloft empty (≠ more44 ruled / more40 surfextrude / more38 loft<2) ──

test('runtime: addSurfLoft without ≥2 open sketches Formal refuse; no surfloft', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().addSurfLoft()
  assert.match(g().status, /曲面放樣：要 ≥2 張【開放折線獨立草圖】/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲面放样：要|规则曲面/)
  assert.equal(g().features.some((f) => f.type === 'surfloft'), false)
  assert.deepEqual(g().features, before)
})

// ── rect Face Pattern nopick (≠ more44 circpattern faces) ──

test('runtime: rect Face Pattern without pick Formal refuse; no pattern feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({ facePatternPicks: [] })
  g().openFeatDlg('pattern')
  g().setFeatParam('objectType', 'faces')
  g().setFeatParam('countX', 2)
  g().setFeatParam('countY', 1)
  g().setFeatParam('dx', 50)
  g().setFeatParam('dy', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /矩形 Face Pattern：請按「🎯選面」並在畫布選至少一個面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /环形 Face Pattern|環形 Face Pattern/)
  assert.ok(g().featDlg, 'dialog stays open on rect faces-nopick refuse')
  assert.equal(g().features.some((f) => f.type === 'pattern'), false)
  assert.deepEqual(g().features, before)
})

// ── revolve wall <0 gate (≠ more37 wall0 timeline / more34 revolve refuse) ──

test('hard: featDlgBlockingReason revolve wall<0 Formal 薄壁不可為負數', () => {
  const reason = featDlgBlockingReason({
    kind: 'revolve',
    params: { angle: 360, wall: -2, axis: 'Y', op: 'new' },
  })
  assert.match(reason || '', /薄壁不可為負數/)
  assert.doesNotMatch(reason || '', /薄壁不可为负|薄壁不可為負數數/)
  assert.equal(
    featDlgBlockingReason({ kind: 'revolve', params: { angle: 360, wall: 0, axis: 'Y' } }),
    null,
    'wall=0 solid revolve is legal',
  )
})

// ── cone dt <0 gate (≠ more37 cone d/h=0) ──

test('hard: featDlgBlockingReason cone dt<0 Formal 頂部直徑不可為負數', () => {
  const reason = featDlgBlockingReason({
    kind: 'cone',
    params: { d: 60, h: 40, dt: -5 },
  })
  assert.match(reason || '', /頂部直徑不可為負數/)
  assert.doesNotMatch(reason || '', /顶部直径|不可为负/)
  assert.equal(
    featDlgBlockingReason({ kind: 'cone', params: { d: 60, h: 40, dt: 0 } }),
    null,
    'dt=0 sharp cone is legal',
  )
})

// ── legacy cpattern count 1 (≠ more40 circpattern count) ──

test('runtime: cpattern count 1 Formal refuse; no cpattern feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('cpattern')
  g().setFeatParam('count', 1)
  g().setFeatParam('angle', 360)
  g().setFeatParam('axis', 'Z')
  await g().commitFeatDlg()
  assert.match(g().status, /環形陣列：數量至少為 2（非法值已拒絕/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /环形阵列：数量/)
  assert.ok(g().featDlg, 'dialog stays open on cpattern refuse')
  assert.equal(
    g().features.some((f) => f.type === 'cpattern' || f.type === 'circPattern' || f.type === 'circpattern'),
    false,
  )
  assert.deepEqual(g().features, before)
})
