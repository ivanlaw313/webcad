/**
 * BOT-D more44 / FISHING87+ — CORE16 true behavior / regression gaps on tip 5bd79329.
 * Complements smoke-21 + more34–more43 samples without duplicating those topics.
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
 * Focus here: emboss empty-text / no-face · scale anisotropic sx<0 · circpattern zero-axis / faces-nopick ·
 * geoPattern empty · delFace nopick · tube wall≥R · rack module 0 · pyramid dim 0 · ruled empty ·
 * sheetmetal thickness 0 · clearFeaLoad Formal.
 * Always-hard: MATERIALS SC keep + F85 重複/無法開模/脫模可達性 + F86 WindTunnel lazy guard.
 * Hand-off: FISHING89 cherry (F88 tip 1187e925 already shipped; more44 absent → F89).
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

// ── always-hard: MATERIALS + F85 / F86 ──

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
  assert.ok(MATERIALS['钢'], 'SC key 钢 must exist on MATERIALS')
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

// ── emboss empty text (≠ more35 depth0 / more39 size0/neg) ──

test('runtime: emboss empty text Formal 未提交／請輸入浮雕文字; no text feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const dlg = {
    kind: 'emboss',
    params: { text: '   ', size: 12, depth: 2, mode: 'raise' },
    payload: { arbPlane: { o: [20, 15, 20], xd: [1, 0, 0], n: [0, 0, 1] } },
  }
  assert.match(featDlgBlockingReason(dlg) || '', /請輸入浮雕文字/)
  useApp.setState({ featDlg: dlg })
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：請輸入浮雕文字/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请输入浮雕文字|未提交：请/)
  assert.ok(g().featDlg, 'dialog stays open on empty-text refuse')
  assert.equal(g().features.some((f) => f.type === 'text'), false)
  assert.deepEqual(g().features, before)
})

// ── emboss no face pick (≠ more35/39 emboss size/depth) ──

test('runtime: emboss with text but no face Formal refuse; no text feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'ABC', size: 12, depth: 2, mode: 'raise' },
      payload: {},
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /浮雕：請先點選要放置文字的面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /浮雕：请先点选/)
  assert.equal(g().features.some((f) => f.type === 'text'), false)
  assert.deepEqual(g().features, before)
})

// ── scale anisotropic sx<0 (≠ more40 factor 0/×2) ──

test('runtime: scale anisotropic sx<0 Formal refuse; no scale feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  g().openFeatDlg('scale')
  assert.equal(g().featDlg?.kind, 'scale')
  g().setFeatParam('sx', -1)
  g().setFeatParam('sy', 1)
  g().setFeatParam('sz', 1)
  await g().commitFeatDlg()
  assert.match(g().status, /非等比縮放：每軸要 ≥0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /非等比缩放|每轴要/)
  assert.ok(g().featDlg, 'dialog stays open on anisotropic refuse')
  assert.equal(g().features.some((f) => f.type === 'scale'), false)
  assert.deepEqual(g().features, before)
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── circpattern zero axis (≠ more40 count) ──

test('runtime: circpattern zero-axis Formal refuse; no circPattern feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('circpattern')
  g().setFeatParam('objectPicked', 1)
  g().setFeatParam('objectType', 'bodies')
  g().setFeatParam('count', 4)
  g().setFeatParam('mode', 'full')
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 0)
  g().setFeatParam('dz', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /環形陣列：軸方向不可是零向量/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /环形阵列：轴方向/)
  assert.ok(g().featDlg, 'dialog stays open on zero-axis refuse')
  assert.equal(
    g().features.some((f) => f.type === 'circPattern' || f.type === 'circpattern' || f.type === 'cpattern'),
    false,
  )
  assert.deepEqual(g().features, before)
})

// ── circpattern faces without pick (≠ more40 count / more41 pathpattern) ──

test('runtime: circpattern faces objectType without pick Formal refuse', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({ facePatternPicks: [] })
  g().openFeatDlg('circpattern')
  g().setFeatParam('objectType', 'faces')
  g().setFeatParam('count', 4)
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 0)
  g().setFeatParam('dz', 1)
  await g().commitFeatDlg()
  assert.match(g().status, /環形 Face Pattern：請按「🎯選面」並在畫布選至少一個面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on faces-nopick refuse')
  assert.equal(
    g().features.some((f) => f.type === 'circPattern' || f.type === 'circpattern'),
    false,
  )
  assert.deepEqual(g().features, before)
})

// ── geoPattern empty targets (≠ more40 circpattern / more41 pathpattern) ──

test('runtime: geoPattern with no selected features Formal refuse', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({ selectedFeature: null, selectedFeatures: [] })
  useApp.setState({
    featDlg: {
      kind: 'geoPattern',
      params: {
        instances: JSON.stringify([{ translation: [10, 0, 0] }]),
      },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /Geometric Pattern：先在時間軸選擇要複製的特徵/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.some((f) => f.type === 'geoPattern'), false)
  assert.deepEqual(g().features, before)
})

// ── delFace nopick (≠ more43 moveface-nopick / more41 shell empty-pick) ──

test('runtime: commitDelFace without pick Formal refuse; no delFace feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({ delFaceMode: true, delFacePicks: [] })
  await g().commitDelFace()
  assert.match(g().status, /請先點選要刪的面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请先点选要删的面/)
  assert.equal(g().features.some((f) => f.type === 'delface' || f.type === 'delFace'), false)
  assert.deepEqual(g().features, before)
})

// ── tube wall ≥ outer R (≠ more40 pipe wall≥R) ──

test('runtime: tube wall ≥ outer radius Formal refuse; no tube extrude', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('tube')
  g().setFeatParam('d', 40)
  g().setFeatParam('wall', 25)
  g().setFeatParam('h', 30)
  await g().commitFeatDlg()
  assert.match(g().status, /壁厚過大（≥外半徑）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /壁厚过大|≥外半径/)
  assert.ok(g().featDlg, 'dialog stays open on tube wall refuse')
  assert.deepEqual(g().features, before)
})

// ── rack module 0 (≠ more43 gear-module-0) ──

test('runtime: rack module 0 Formal refuse; no rack feature', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('rack')
  g().setFeatParam('module', 0)
  g().setFeatParam('length', 80)
  g().setFeatParam('thickness', 10)
  await g().commitFeatDlg()
  assert.match(g().status, /模数 要大於 0|模數 要大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on rack refuse')
  assert.equal(g().features.some((f) => f.type === 'rack'), false)
  assert.deepEqual(g().features, before)
})

// ── pyramid dim 0 (≠ more37 box/cyl/cone 0) ──

test('runtime: pyramid d/h = 0 Formal refuse; no loft pyramid', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('pyramid')
  g().setFeatParam('d', 0)
  g().setFeatParam('h', 40)
  g().setFeatParam('sides', 4)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸要大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /尺寸要大于 0/)
  assert.ok(g().featDlg, 'dialog stays open on pyramid refuse')
  assert.equal(g().features.some((f) => f.type === 'loft' || f.type === 'pyramid'), false)
  assert.deepEqual(g().features, before)
})

// ── ruled empty (≠ more40 surfextrude empty / more38 loft <2) ──

test('runtime: addRuled without ≥2 open sketches Formal refuse; no ruled feature', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().addRuled()
  assert.match(g().status, /規則曲面：要 ≥2 張【開放折線獨立草圖】/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /规则曲面：要/)
  assert.equal(g().features.some((f) => f.type === 'ruled'), false)
  assert.deepEqual(g().features, before)
})

// ── sheetmetal thickness 0 (≠ more40 shell thickness-0) ──

test('runtime: sheetmetal thickness 0 Formal refuse; no sheetmetal feature', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('sheetmetal')
  g().setFeatParam('thickness', 0)
  g().setFeatParam('width', 40)
  g().setFeatParam('radius', 3)
  g().setFeatParam('legA', 60)
  g().setFeatParam('legB', 40)
  await g().commitFeatDlg()
  assert.match(g().status, /板厚 要大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on sheetmetal refuse')
  assert.equal(g().features.some((f) => f.type === 'sheetmetal'), false)
  assert.deepEqual(g().features, before)
})

// ── clearFeaLoad Formal (≠ more42 clearFea 已清除受力雲圖) ──

test('runtime: clearFeaLoad Formal 已移除受力面 / 模擬結果已失效; load cleared', () => {
  reset()
  useApp.setState({
    feaMode: 2,
    feaFixed: { point: [0, 0, 0], normal: [0, 0, 1] },
    feaLoad: { point: [40, 0, 10], normal: [0, 0, 1] },
    feaResult: { vmMax: 1, dispMax: 0.01, nVox: 8 },
  })
  assert.ok(g().feaLoad)
  assert.ok(g().feaResult)
  g().clearFeaLoad()
  assert.equal(g().feaLoad, null)
  assert.equal(g().feaResult, null)
  assert.match(g().status, /已移除受力面/)
  assert.match(g().status, /模擬結果已失效/)
  assert.doesNotMatch(g().status, /已移除受力面云|模拟结果已失效|已清除受力雲圖/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().feaFixed?.point[0], 0, 'fixed end kept')
})
