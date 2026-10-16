/**
 * BOT-D more46 / FISHING89+ — CORE16 true behavior / regression gaps on tip 3e6cb52d.
 * Complements smoke-21 + more34–more45 samples without duplicating those topics.
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
 * more45: MATERIALS+F88/F86, sphere/wedge/halfcyl-0, pulley-Ø0, rtube/profile wall, gearbox-ratio,
 * automatedmodel/surfloft empty, rect FacePattern, revolve-wall-/cone-dt-neg, cpattern-1.
 * Focus here: dome/pie/prism/thread-rod dim-0 · boundaryfill no-parked · surfsweep empty ·
 * pushpull-edit dist0 · circpattern objectPicked0 · facethread no-solid · cylpatch no-solid ·
 * draft no-solid · splitbody offset OOR · automatedmodel radius≤0.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F85 重複 (≠ more45 F86 pin).
 * Hand-off: FISHING91 cherry (F89 tip base with more44; F90 has more45; do NOT target F89/F90).
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

// ── always-hard: MATERIALS + F88 / F85 ──

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

test('always-hard: FISHING85 Formal 重複 not 重復 + draft 無法開模 + 脫模可達性', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  const i18n = rd('src/i18n.ts')
  const rb = rd('src/ribbon.ts')
  assert.match(st, /改重複密度，無 UV 縫/)
  assert.match(st, /共用重複密度/)
  assert.match(st, /焊接 \$\{fixed\} 重複頂點/)
  assert.match(st, /重複三角/)
  assert.match(st, /再畫一張，重複\$\{skippedArb/)
  assert.doesNotMatch(st, /重復密度/)
  assert.doesNotMatch(st, /重復頂點/)
  assert.doesNotMatch(st, /重復三角/)
  assert.match(vp, /倒扣（無法開模）/)
  assert.match(vp, /重複·\$\{lastCommand\.label\}|重複上次/)
  assert.doesNotMatch(vp, /重復上次|重復·/)
  assert.match(i18n, /'脫模可達性': 'Demold Accessibility'/)
  assert.match(rb, /label: '脫模可達性'/)
  assert.doesNotMatch(rb, /label: '脱模可达性'/)
})

// ── dome dim-0 (≠ more37 box/cyl/cone / more45 sphere/wedge/halfcyl) ──

test('runtime: dome d=0 Formal 尺寸已拒絕; no dome prim', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('dome')
  g().setFeatParam('d', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /尺寸必须大于 0|尺寸已拒绝/)
  assert.ok(g().featDlg, 'dialog stays open on dome refuse')
  assert.equal(g().features.some((f) => f.type === 'prim' && f.shape === 'dome'), false)
  assert.deepEqual(g().features, before)
})

// ── pie dim-0 (≠ more37 cyl 0 / more45 halfcyl) ──

test('runtime: pie h=0 Formal 尺寸已拒絕; no pie prim', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('pie')
  g().setFeatParam('d', 60)
  g().setFeatParam('ang', 90)
  g().setFeatParam('h', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on pie refuse')
  assert.equal(g().features.some((f) => f.type === 'prim' && f.shape === 'pie'), false)
  assert.deepEqual(g().features, before)
})

// ── prism dim-0 (≠ more37 box / more44 pyramid-0) ──

test('runtime: prism d=0 Formal 尺寸已拒絕; no prism extrude', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('prism')
  g().setFeatParam('sides', 6)
  g().setFeatParam('d', 0)
  g().setFeatParam('h', 30)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on prism refuse')
  assert.equal(g().features.some((f) => f.type === 'extrude' || (f.type === 'prim' && f.shape === 'prism')), false)
  assert.deepEqual(g().features, before)
})

// ── thread rod pitch-0 (≠ more43 ithread-gate / more45 pulley) ──

test('runtime: thread rod pitch=0 Formal 尺寸已拒絕; no thread feature', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('thread')
  g().setFeatParam('d', 20)
  g().setFeatParam('pitch', 0)
  g().setFeatParam('h', 40)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /内螺纹|內螺紋/)
  assert.ok(g().featDlg, 'dialog stays open on thread-rod refuse')
  assert.equal(g().features.some((f) => f.type === 'thread'), false)
  assert.deepEqual(g().features, before)
})

// ── boundaryfill no parked (≠ more40 combine empty / more45 automatedmodel empty) ──

test('runtime: boundaryfill without parked body Formal refuse; no dialog', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openBoundaryFillDlg()
  assert.match(g().status, /Boundary Fill：需要活動實體加至少一個獨立實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Boundary Fill：请|需要活动实体/)
  assert.equal(g().featDlg, null, 'dialog does not open without parked tool body')
  assert.equal(g().features.some((f) => f.type === 'boundaryfill'), false)
  assert.deepEqual(g().features, before)
})

// ── surfsweep empty (≠ more40 surfextrude / more44 ruled / more45 surfloft) ──

test('runtime: addSurfSweep without open path Formal refuse; no surfsweep', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ mode: 'model', sketchShape: null, sketchProfiles: [], polyPts: [] })
  await g().addSurfSweep()
  assert.match(g().status, /曲面掃掠：先畫一個【開放折線截面】/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲面扫掠：先画|曲面拉伸：先畫/)
  assert.equal(g().features.some((f) => f.type === 'surfsweep'), false)
  assert.deepEqual(g().features, before)
})

// ── pushpull-edit dist 0 gate (≠ more36 pushpull success / more41 rect dx=0) ──

test('hard: featDlgBlockingReason pushpull-edit dist=0 Formal 按拉距離不可為 0', () => {
  const reason = featDlgBlockingReason({
    kind: 'pushpull-edit',
    params: { dist: 0 },
    editId: 'PP1',
  })
  assert.match(reason || '', /按拉距離不可為 0/)
  assert.doesNotMatch(reason || '', /按拉距离不可为 0|間距不可為 0/)
  assert.equal(
    featDlgBlockingReason({ kind: 'pushpull-edit', params: { dist: 5 }, editId: 'PP1' }),
    null,
    'nonzero pushpull-edit dist is legal',
  )
})

// ── circpattern objectPicked=0 (≠ more44 faces-nopick / more40 count / more44 zero-axis) ──

test('runtime: circpattern bodies without objectPicked Formal refuse; no circPattern', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('circpattern')
  g().setFeatParam('objectType', 'bodies')
  g().setFeatParam('objectPicked', 0)
  g().setFeatParam('count', 6)
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 0)
  g().setFeatParam('dz', 1)
  await g().commitFeatDlg()
  assert.match(g().status, /環形陣列：先在 Objects 按「選擇」確認活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /环形阵列：先在|Face Pattern/)
  assert.ok(g().featDlg, 'dialog stays open on objectPicked refuse')
  assert.equal(
    g().features.some((f) => f.type === 'circPattern' || f.type === 'circpattern' || f.type === 'cpattern'),
    false,
  )
  assert.deepEqual(g().features, before)
})

// ── facethread / othread without solid (≠ more43 ithread-gate) ──

test('runtime: facethread without solid Formal 面加外螺紋 refuse; no threadFacePick', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  await g().runCommand('facethread', '面加外螺紋')
  assert.match(g().status, /面加外螺紋：先要有實體（圓柱\/凸台）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /面加外螺纹：先要有实体/)
  assert.equal(g().threadFacePick, false)
  assert.equal(g().featDlg, null)
  assert.equal(g().features.some((f) => f.type === 'othread' || f.type === 'ithread'), false)
  assert.deepEqual(g().features, before)
})

// ── cylpatch without solid (≠ more43 moveface / more44 delface) ──

test('runtime: cylpatch without solid Formal 請先建立一個實體; no cylpatch', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('cylpatch')
  assert.match(g().status, /請先建立一個實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请先建立一个实体/)
  assert.equal(g().featDlg, null)
  assert.equal(g().features.some((f) => f.type === 'cylpatch'), false)
  assert.deepEqual(g().features, before)
})

// ── draft without solid (≠ more40 draft angle gate) ──

test('runtime: draft without solid Formal 請先建立一個實體; no draft dlg', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('draft')
  assert.match(g().status, /請先建立一個實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().featDlg, null)
  assert.equal(g().features.some((f) => f.type === 'draft'), false)
  assert.deepEqual(g().features, before)
})

// ── splitbody offset OOR (≠ more43 blank offset) ──

test('runtime: splitbody offset outside body Formal refuse; volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  g().openFeatDlg('splitbody')
  assert.equal(g().featDlg?.kind, 'splitbody')
  g().setFeatParam('axis', 'Z')
  g().setFeatParam('offset', 999)
  await g().commitFeatDlg()
  assert.match(g().status, /分割平面沒有穿過實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /分割平面没有穿过实体|請輸入分割平面的位置/)
  assert.ok(g().featDlg, 'dialog stays open on OOR split refuse')
  assert.equal(g().features.some((f) => f.type === 'split' || f.type === 'splitbody'), false)
  assert.deepEqual(g().features, before)
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── automatedmodel radius≤0 (≠ more45 empty picks) ──

test('runtime: automatedmodel radius≤0 with 2 picks Formal refuse; no automatedmodel', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('automatedmodel')
  assert.equal(g().featDlg?.kind, 'automatedmodel')
  useApp.setState({
    featDlg: {
      ...g().featDlg,
      params: { ...g().featDlg.params, radius: 0 },
      payload: {
        picks: [
          { p: [0, 0, 20], n: [0, 0, 1] },
          { p: [40, 0, 20], n: [0, 0, 1] },
        ],
      },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /Automated Modeling：連接半徑必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /连接半径必须大于 0|請在畫布選取兩張平面面/)
  assert.ok(g().featDlg, 'dialog stays open on radius refuse')
  assert.equal(g().features.some((f) => f.type === 'automatedmodel'), false)
  assert.deepEqual(g().features, before)
})
