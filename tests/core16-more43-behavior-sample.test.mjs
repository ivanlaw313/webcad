/**
 * BOT-D more43 / FISHING85+ — CORE16 true behavior / regression gaps on tip 321d298.
 * Complements smoke-21 + more34–more42 samples without duplicating those topics.
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
 * cyl/cone timeline label, sketch DOF, appearance color (setMaterialPreset), dialog OK, fillet chip R 2→3.
 * more40: MATERIALS+F70 控製→控制 + F69 運動連結, draft angle, shell thickness-0 commit, pipe wall≥R,
 * circpattern count, scale factor 0/×2, combine empty, measure distance Formal, undo fillet→chamfer,
 * surfextrude empty.
 * more41: MATERIALS+F77/76/75/74, planComponentMove, pathpattern count 0/1, rect dx=0, shell empty-pick,
 * sweep end-scale, thicken quilt thick 0, measure area／稜長.
 * more42: MATERIALS+F81/79/78, pathpattern empty/cap>100, offsetsurf dist 0, hole csAngle clamp,
 * revolve cross-axis, loft rail no-open-poly, thicken missing, measure 軸線夾角, setPhysicalMaterial,
 * reorder dependency refuse, setFeaOpt/clearFea.
 * Focus here: coil dim-0 · body-move zero · wrap/project empty · rib empty path · pipe empty path ·
 * offsetsolid dist 0 · torus self-intersect · gear module 0 · ithread ≤0 · splitbody blank offset ·
 * moveFace no-pick · measure volume Formal · face-mate cancel Formal.
 * Always-hard: MATERIALS SC keep + F85 重複/無法開模/脫模可達性 + F83 關閉脫模可達性.
 * Hand-off: FISHING87 cherry (F86 tip a08c8fc already shipped).
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

const { useApp, MATERIALS } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')
const { combineMeasure } = await import('../src/cad/measureCombine.ts')
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

// ── always-hard: MATERIALS + F85 / F83 ──

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

test('always-hard: FISHING83 Formal 關閉脫模可達性 + clearAccessibility 已關', () => {
  const vp = rd('src/components/Viewport.tsx')
  const i18n = rd('src/i18n.ts')
  const st = rd('src/store.ts')
  assert.match(vp, /title=\{tStatus\('關閉脫模可達性'/)
  assert.match(i18n, /'關閉脫模可達性': 'Close demold accessibility'/)
  assert.doesNotMatch(vp, /關閉可達性分析/)
  assert.doesNotMatch(i18n, /關閉可達性分析/)
  assert.match(st, /status: '已關脫模可達性'/)
  reset()
  useApp.setState({
    accessResult: { positions: new Float32Array(3), colors: new Float32Array(3), nBlocked: 0, nTotal: 1, tooLarge: false },
  })
  g().clearAccessibility()
  assert.equal(g().accessResult, null)
  assert.match(g().status, /已關脫模可達性/)
  assert.doesNotMatch(g().status, /已关脱模可达性|关闭可达性/)
  assert.doesNotMatch(g().status, COLLOQ)
})

// ── coil dim-0 refuse (≠ more37 box/cyl/cone 0 prim gate wording path) ──

test('runtime: coil d/pitch/wire/h = 0 Formal 尺寸已拒絕; no coil feature', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('coil')
  assert.equal(g().featDlg?.kind, 'coil')
  g().setFeatParam('pitch', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕/)
  assert.match(g().status, /尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on coil refuse')
  assert.equal(g().features.some((f) => f.type === 'coil'), false)
  assert.deepEqual(g().features, before)

  g().setFeatParam('pitch', 12)
  g().setFeatParam('wire', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕/)
  assert.equal(g().features.some((f) => f.type === 'coil'), false)
})

// ── body move zero (≠ more35 move cancel / more41 joint-move) ──

test('runtime: body move dx=dy=dz=0 Formal refuse; no transform feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  g().openFeatDlg('move')
  assert.equal(g().featDlg?.kind, 'move')
  g().setFeatParam('moveType', 'translate')
  g().setFeatParam('objectType', 'bodies')
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 0)
  g().setFeatParam('dz', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /移動：請輸入非零的平移、旋轉或點對點位移/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /移动：请输入非零/)
  assert.ok(g().featDlg, 'dialog stays open on zero-move refuse')
  assert.equal(g().features.some((f) => f.type === 'transform'), false)
  assert.deepEqual(g().features, before)
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── wrap / project-to-cylinder empty (≠ more39 emboss size0) ──

test('runtime: projectSketchToCylinder outside sketch / no curve Formal refuse', async () => {
  reset()
  assert.equal(g().mode !== 'sketch', true)
  await g().projectSketchToCylinder()
  assert.match(g().status, /投影到圓柱面：請先入草圖並畫一條曲線/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /投影到圆柱面/)
  assert.equal(g().ccurves.length, 0)

  useApp.setState({
    mode: 'sketch',
    sketchPlane: 'XY',
    sketchBaseZ: 0,
    sketchProfiles: [],
    sketchShape: null,
  })
  await g().projectSketchToCylinder()
  assert.match(g().status, /投影到圓柱面：找不到可投影的曲線/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().ccurves.length, 0)
})

// ── rib empty path (≠ more40 pipe wall / more42 pathpattern empty) ──

test('runtime: rib empty path Formal refuse; no rib feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({
    featDlg: {
      kind: 'rib',
      params: { thickness: 4, direction: 'symmetric', extent: 'tobody', draft: 0, flip: 0 },
      payload: { path: [], paths: [] },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /加強筋：沒有有效路徑/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /加强筋：没有有效路径/)
  assert.equal(g().features.some((f) => f.type === 'rib'), false)
  assert.deepEqual(g().features, before)
})

// ── pipe empty path (≠ more40 hollow wall≥R) ──

test('runtime: pipe empty/short path Formal refuse; no sweep feature', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({
    featDlg: {
      kind: 'pipe',
      params: { size: 24, hollow: 0, thickness: 4, dist: 1, section: 'circular', op: 'new' },
      payload: { path: [[0, 0]] },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /管道：沒有有效路徑/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /管道：没有有效路径/)
  assert.equal(g().features.some((f) => f.type === 'sweep' || f.type === 'pipe'), false)
  assert.deepEqual(g().features, before)
})

// ── offsetsolid dist 0 (≠ more42 offsetSurfFaceAt dist 0) ──

test('runtime: offsetsolid dist 0 Formal refuse; no offsetsolid feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  g().openFeatDlg('offsetsolid')
  assert.equal(g().featDlg?.kind, 'offsetsolid')
  g().setFeatParam('distance', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /整體偏移：距離要是非零數字/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /整体偏移：距离要是非零数字/)
  assert.ok(g().featDlg, 'dialog stays open on dist-0 refuse')
  assert.equal(g().features.some((f) => f.type === 'offsetsolid'), false)
  assert.deepEqual(g().features, before)
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── torus self-intersect gate (≠ more37 sphere/cyl 0) ──

test('runtime: torus tube Ø ≥ outer/2 Formal refuse; no torus prim', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('torus')
  g().setFeatParam('d', 80)
  g().setFeatParam('td', 50)
  await g().commitFeatDlg()
  assert.match(g().status, /圓環：管徑要細過外徑一半/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /圆环：管径/)
  assert.ok(g().featDlg, 'dialog stays open on torus refuse')
  assert.equal(
    g().features.some((f) => f.type === 'prim' && f.shape === 'torus'),
    false,
  )
  assert.deepEqual(g().features, before)
})

// ── gear module 0 (≠ more37 prim 0 / more40 scale 0) ──

test('runtime: gear module 0 Formal refuse; no gear feature', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('gear')
  g().setFeatParam('module', 0)
  await g().commitFeatDlg()
  assert.match(g().status, /模数 要大於 0|模數 要大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on gear refuse')
  assert.equal(g().features.some((f) => f.type === 'gear'), false)
  assert.deepEqual(g().features, before)
})

// ── ithread ≤0 (≠ more35 hole csink / more42 csAngle) ──

test('runtime: ithread d/pitch/height ≤0 Formal refuse; no ithread feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('ithread')
  g().setFeatParam('d', 8)
  g().setFeatParam('pitch', 0)
  g().setFeatParam('height', 12)
  await g().commitFeatDlg()
  assert.match(g().status, /內螺紋：公稱Ø\/螺距\/深度都要大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /内螺纹：公称/)
  assert.equal(g().features.some((f) => f.type === 'ithread'), false)
  assert.deepEqual(g().features, before)
})

// ── splitbody blank offset (≠ more35 split success / more36 reorder) ──

test('runtime: splitbody blank offset Formal refuse; no split feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  g().openFeatDlg('splitbody')
  assert.equal(g().featDlg?.kind, 'splitbody')
  g().setFeatParam('offset', '')
  await g().commitFeatDlg()
  assert.match(g().status, /分割實體：請輸入分割平面的位置/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /分割实体：请输入/)
  assert.ok(g().featDlg, 'dialog stays open on blank-offset refuse')
  assert.equal(g().features.some((f) => f.type === 'split' || f.type === 'splitbody'), false)
  assert.deepEqual(g().features, before)
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── moveFace no-pick (≠ more36 pushpull / more41 shell empty-pick) ──

test('runtime: commitMoveFace without pick Formal refuse; no moveface feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({ moveFaceMode: true, moveFacePicks: [], moveFacePick: null, moveFaceDist: -5 })
  await g().commitMoveFace()
  assert.match(g().status, /請先點選要移動的面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请先点选要移动的面/)
  assert.equal(g().features.some((f) => f.type === 'moveface'), false)
  assert.deepEqual(g().features, before)
})

// ── measure volume Formal (≠ more40 distance / more41 area／稜長 / more42 軸線夾角) ──

test('hard: measure Formal 體積 for body pick (not SC 体积)', () => {
  const vol = combineMeasure([{ kind: 'body', volume: 24000 }])
  assert.equal(vol.type, 'volume')
  assert.equal(vol.label, '體積')
  assert.equal(vol.value, 24000)
  assert.doesNotMatch(vol.label, /体积/)
  assert.doesNotMatch(vol.label, COLLOQ)
  const empty = combineMeasure([])
  assert.equal(empty.type, 'empty')
  assert.equal(empty.label, '拾取')
})

// ── face-mate cancel Formal (≠ more41 planComponentMove) ──

test('runtime: cancelFaceMate Formal 已退出選面配合; startFaceMate status TC', () => {
  reset()
  g().startFaceMate()
  assert.equal(g().faceMateMode, true)
  assert.match(g().status, /選面配合|點.*面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /选面配合/)
  g().cancelFaceMate()
  assert.equal(g().faceMateMode, false)
  assert.equal(g().faceMatePick, null)
  assert.match(g().status, /已退出選面配合/)
  assert.doesNotMatch(g().status, /已退出选面配合/)
  assert.doesNotMatch(g().status, COLLOQ)
})
