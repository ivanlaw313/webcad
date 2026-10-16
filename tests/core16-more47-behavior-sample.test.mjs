/**
 * BOT-D more47 / FISHING90+ — CORE16 true behavior / regression gaps on tip 6f4e24d6.
 * Complements smoke-21 + more34–more46 samples without duplicating those topics.
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
 * more46: MATERIALS+F88/F85, dome/pie/prism/thread-rod-0, boundaryfill, surfsweep, pushpull-edit,
 * circ-objectPicked0, facethread/cylpatch/draft-no-solid, split-OOR, automatedmodel-r0.
 * Focus here: torus d=0 · mirror/scale/hole no-solid · surfrevolve empty · mergefaces/reversesurf/
 * surfunstitch/thickenquilt empty · formmirror no-cage · chamfer-edit dist0 · shell-edit t0 ·
 * accessanalysis no-solid.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F90 zhCN 脱模可达性
 * (≠ more46 F85 重複 trio).
 * Hand-off: FISHING92 cherry (more46 → F91; more45 on F90; do NOT target F90/F91).
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
const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () =>
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

// ── always-hard: MATERIALS + F88 / F90 ──

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

test('always-hard: FISHING90 zhCN Formal 脱模可达性 (≠ more46 F85 重複 / ribbon TC)', () => {
  const zhCN = rd('src/i18n/zhCNLabels.ts')
  const zhCNLoc = rd('src/i18n/locales/zh-CN.ts')
  const labelToKey = rd('src/i18n/labelToKey.ts')
  assert.match(zhCN, /"可达性分析": "脱模可达性"/)
  assert.match(zhCN, /"可達性分析": "脱模可达性"/)
  assert.match(zhCNLoc, /"cmd.accessanalysis": "脱模可达性"/)
  assert.match(zhCNLoc, /"tool.accessanalysis": "脱模可达性"/)
  assert.match(zhCNLoc, /"alias.accessanalysis": "脱模可达性/)
  assert.match(labelToKey, /'脱模可达性': 'tool.accessanalysis'/)
  assert.doesNotMatch(zhCNLoc, /"tool.accessanalysis": "可达性分析"/)
  assert.doesNotMatch(zhCNLoc, /"cmd.accessanalysis": "可达性分析"/)
})

// ── torus d=0 (≠ more43 torus-self / more37 sphere / more45 sphere) ──

test('runtime: torus d=0 Formal 尺寸已拒絕; no torus prim', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('torus')
  g().setFeatParam('d', 0)
  g().setFeatParam('td', 24)
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /管徑要細過|尺寸必须大于 0/)
  assert.ok(g().featDlg, 'dialog stays open on torus d=0 refuse')
  assert.equal(g().features.some((f) => f.type === 'prim' && f.shape === 'torus'), false)
  assert.deepEqual(g().features, before)
})

// ── mirror no-solid (≠ more39 mirror gate with solid / more40 combine empty) ──

test('runtime: mirror without solid Formal 請先建立一個實體; no mirror dlg', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('mirror')
  assert.match(g().status, /請先建立一個實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请先建立一个实体/)
  assert.equal(g().featDlg, null)
  assert.equal(g().features.some((f) => f.type === 'mirror'), false)
  assert.deepEqual(g().features, before)
})

// ── scale no-solid (≠ more40 scale 0/×2 / more44 scale-aniso) ──

test('runtime: scale without solid Formal 請先建立一個實體; no scale dlg', async () => {
  reset()
  const before = structuredClone(g().features)
  g().openFeatDlg('scale')
  assert.match(g().status, /請先建立一個實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().featDlg, null)
  assert.equal(g().features.some((f) => f.type === 'scale'), false)
  assert.deepEqual(g().features, before)
})

// ── hole no-solid (≠ more35 hole csink / more37 hole gate / more42 csAngle) ──

test('runtime: hole without solid Formal 孔需要先有一個實體; no holeMode', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  await g().runCommand('hole', '孔')
  assert.match(g().status, /孔需要先有一個實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /孔需要先有一个实体|请先建立一个实体/)
  assert.equal(g().holeMode, false)
  assert.equal(g().featDlg, null)
  assert.equal(g().features.some((f) => f.type === 'hole'), false)
  assert.deepEqual(g().features, before)
})

// ── surfrevolve empty (≠ more40 surfextrude / more44 ruled / more45 surfloft / more46 surfsweep) ──

test('runtime: surfrevolve without open path Formal refuse; no surfrevolve', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ mode: 'model', sketchShape: null, sketchProfiles: [], polyPts: [] })
  await g().runCommand('surfrevolve', '曲面旋轉')
  assert.match(g().status, /曲面旋轉需要先畫一個【開放折線截面】/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲面旋转需要先画|曲面掃掠：先畫|曲面放樣：要/)
  assert.equal(g().features.some((f) => f.type === 'surfrevolve'), false)
  assert.deepEqual(g().features, before)
})

// ── mergefaces empty (≠ more44 delface / more43 moveface) ──

test('runtime: mergefaces without parked Formal refuse; no mergefaces', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('mergefaces', '合併面')
  assert.match(g().status, /合併面：沒有曲面\/殼體可合併/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /合并面：没有曲面/)
  assert.equal(g().features.some((f) => f.type === 'mergefaces'), false)
  assert.deepEqual(g().features, before)
})

// ── reversesurf empty (≠ more46 surfsweep / more45 surfloft) ──

test('runtime: reversesurf without parked Formal refuse; no reversesurf', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('reversesurf', '翻轉曲面')
  assert.match(g().status, /翻轉曲面：沒有曲面\/殼體可翻/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /翻转曲面：没有曲面/)
  assert.equal(g().features.some((f) => f.type === 'reversesurf'), false)
  assert.deepEqual(g().features, before)
})

// ── surfunstitch empty (≠ more41 thicken quilt / more42 thicken missing) ──

test('runtime: surfunstitch without parked Formal refuse; no surfunstitch', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('surfunstitch', '取消縫合')
  assert.match(g().status, /取消縫合 Unstitch：沒有曲面\/殼體可拆/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /取消缝合/)
  assert.equal(g().features.some((f) => f.type === 'surfunstitch'), false)
  assert.deepEqual(g().features, before)
})

// ── thickenquilt empty (≠ more41 thicken quilt thick 0 / more42 thicken missing) ──

test('runtime: thickenquilt without parked Formal refuse; no thickenquilt', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('thickenquilt', '加厚曲面')
  assert.match(g().status, /加厚曲面：沒有曲面\/殼體可加厚/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /加厚曲面：没有曲面|加厚：請先點選/)
  assert.equal(g().features.some((f) => f.type === 'thickenquilt'), false)
  assert.deepEqual(g().features, before)
})

// ── formmirror no-cage (≠ more39 mirror gate / model mirror no-solid) ──

test('runtime: formmirror without formCage Formal refuse; no formMirror', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formCage, null)
  await g().runCommand('formmirror', '造型鏡像')
  assert.match(g().status, /鏡像：請先建立一個造型基本體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请先建立一个造型|請先建立一個實體/)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

// ── chamfer-edit dist=0 (≠ more37 chamfer dist2=0 / more46 pushpull-edit dist0) ──

test('runtime: chamfer-edit distance=0 Formal 尺寸已拒絕; dialog stays', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({
    featDlg: {
      kind: 'chamfer-edit',
      params: { distance: 0, cmode: 'equal', dist2: 0, angle: 45, flip: 0, chain: 0 },
      editId: 'CH1',
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /雙距離：距離 2|按拉距離不可為 0/)
  assert.ok(g().featDlg, 'dialog stays open on chamfer-edit refuse')
  assert.equal(g().featDlg?.kind, 'chamfer-edit')
  assert.deepEqual(g().features, before)
})

// ── shell-edit t=0 (≠ more40 shell thickness-0 create / more37 thicken 0) ──

test('runtime: shell-edit thickness=0 Formal 壁厚必須大於 0; dialog stays', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({
    featDlg: {
      kind: 'shell-edit',
      params: { thickness: 0, direction: 'inside' },
      editId: 'SH1',
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /尺寸已拒絕：壁厚必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /壁厚必须大于 0|加厚厚度必須大於 0/)
  assert.ok(g().featDlg, 'dialog stays open on shell-edit refuse')
  assert.equal(g().featDlg?.kind, 'shell-edit')
  assert.deepEqual(g().features, before)
})

// ── accessanalysis no-solid (≠ more46 draft-no-solid / F90 pin above) ──

test('runtime: accessanalysis without solid Formal 脫模可達性：需要活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().accessResult, null)
  await g().runCommand('accessanalysis', '脫模可達性')
  assert.match(g().status, /脫模可達性：需要活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /脱模可达性：需要活动实体|请先建立一个实体/)
  assert.equal(g().accessResult, null)
  assert.deepEqual(g().features, before)
})
