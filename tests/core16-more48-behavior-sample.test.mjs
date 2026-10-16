/**
 * BOT-D more48 / FISHING91+ — CORE16 true behavior / regression gaps on tip 543538ef.
 * Complements smoke-21 + more34–more47 samples without duplicating those topics.
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
 * more47: MATERIALS+F88/F90, torus-d0, mirror/scale/hole-no-solid, surfrevolve-empty,
 * mergefaces/reversesurf/surfunstitch/thickenquilt-empty, formmirror-no-cage, chamfer-edit-dist0,
 * shell-edit-t0, access-no-solid.
 * Focus here: offsetsolid/ucs/splitplane/slicepreview no-solid · surftrim/untrim empty ·
 * formsubdiv no-cage · extrude-edit h0 · rect objectPicked0 · minradius/replaceface/rotateface/
 * draftanalysis no-solid.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F91 ja 離型到達性
 * (≠ more47 F90 zhCN 脱模可达性 trio).
 * Hand-off: FISHING93 cherry (more47 → F92; more46 on F91; do NOT target F91/F92).
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

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }

// ── always-hard: MATERIALS + F88 / F91 ──

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

test('always-hard: FISHING91 ja Formal 離型到達性 + F92 ja locale (≠ more47 F90 zhCN 脱模可达性)', () => {
  // Soft-prep more48 pinned F91 tip (ja locale still アクセス解析). F92 tip already
  // renamed cmd/tool → 離型到達性; keep jaLabels F91 pin + F92 locale pin on F93.
  const jaLabels = rd('src/i18n/jaLabels.ts')
  const jaLoc = rd('src/i18n/locales/ja.ts')
  assert.match(jaLabels, /"可达性分析": "離型到達性"/)
  assert.match(jaLabels, /"可達性分析": "離型到達性"/)
  assert.match(jaLoc, /"cmd.accessanalysis": "離型到達性"/)
  assert.match(jaLoc, /"tool.accessanalysis": "離型到達性"/)
  assert.match(jaLoc, /"alias.accessanalysis": "[^"]*離型到達性[^"]*"/)
  assert.doesNotMatch(jaLabels, /"可达性分析": "脱模可达性"/)
  assert.doesNotMatch(jaLabels, /"可达性分析": "可達性分析"/)
  assert.doesNotMatch(jaLoc, /"cmd.accessanalysis": "アクセス解析"/)
  assert.doesNotMatch(jaLoc, /"tool.accessanalysis": "アクセス解析"/)
})

// ── offsetsolid no-solid (≠ more43 offsetsolid dist 0) ──

test('runtime: offsetsolid without solid Formal 整體偏移需要先有實體; no dlg', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('offsetsolid', '整體偏移')
  assert.match(g().status, /整體偏移需要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /整体偏移需要先有实体|請先建立一個實體/)
  assert.equal(g().featDlg, null)
  assert.equal(g().features.some((f) => f.type === 'offsetsolid'), false)
  assert.deepEqual(g().features, before)
})

// ── ucs no-solid (≠ more47 access / more46 draft) ──

test('runtime: ucs without solid Formal UCS：需要先有實體; no ucs pick', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('ucs', 'UCS')
  assert.match(g().status, /UCS：需要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /UCS：需要先有实体|请先建立一个实体/)
  assert.equal(g().ucsPick, false)
  assert.deepEqual(g().features, before)
})

// ── splitplane no-solid (≠ more43/46 splitbody) ──

test('runtime: splitplane without solid Formal 任意平面切需要先有實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('splitplane', '任意平面切')
  assert.match(g().status, /任意平面切需要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /任意平面切需要先有实体/)
  assert.equal(g().splitPlanePick, false)
  assert.deepEqual(g().features, before)
})

// ── slicepreview no-solid (≠ more47 access / more46 draft) ──

test('runtime: slicepreview without solid Formal 切層預覽需要先有實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().sliceOpen, false)
  await g().runCommand('slicepreview', '切層預覽')
  assert.match(g().status, /切層預覽需要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /切层预览需要先有实体/)
  assert.equal(g().sliceOpen, false)
  assert.deepEqual(g().features, before)
})

// ── surftrim empty (≠ more47 mergefaces / more46 surfsweep / more45 surfloft) ──

test('runtime: surftrim without parked Formal refuse; no surftrim', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('surftrim', '平面裁剪')
  assert.match(g().status, /平面裁剪：沒有曲面\/殼體可裁/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /平面裁剪：没有曲面|合併面：沒有曲面/)
  assert.equal(g().features.some((f) => f.type === 'surftrim'), false)
  assert.deepEqual(g().features, before)
})

// ── untrim empty (≠ more47 surfunstitch / thickenquilt) ──

test('runtime: untrim without parked Formal refuse; no untrim', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('untrim', '去裁')
  assert.match(g().status, /去裁：沒有曲面\/殼體可還原/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /去裁：没有曲面|取消縫合/)
  assert.equal(g().features.some((f) => f.type === 'untrim'), false)
  assert.deepEqual(g().features, before)
})

// ── formsubdiv no-cage (≠ more47 formmirror) ──

test('runtime: formsubdiv without formCage Formal refuse; no form levels', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formCage, null)
  await g().runCommand('formsubdiv', '細分')
  assert.match(g().status, /細分：請先建立一個造型基本體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /细分：请先|鏡像：請先建立一個造型/)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

// ── extrude-edit h=0 (≠ more46 pushpull-edit / more47 chamfer-edit / more37 extrude) ──

test('runtime: extrude-edit height=0 Formal 請輸入非零拉伸距離; dialog stays', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({
    featDlg: {
      kind: 'extrude-edit',
      params: { height: 0, heightExpr: '0', op: 'new', extent: 'distance' },
      editId: 'E1',
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /請輸入非零拉伸距離/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请输入非零拉伸距离|尺寸已拒絕：尺寸必須大於 0|按拉距離不可為 0/)
  assert.ok(g().featDlg, 'dialog stays open on extrude-edit refuse')
  assert.equal(g().featDlg?.kind, 'extrude-edit')
  assert.deepEqual(g().features, before)
})

// ── rect pattern objectPicked=0 (≠ more46 circ objectPicked0 / more45 FacePattern) ──

test('runtime: pattern bodies without objectPicked Formal refuse; no pattern', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('pattern')
  g().setFeatParam('objectType', 'bodies')
  g().setFeatParam('objectPicked', 0)
  g().setFeatParam('countX', 2)
  g().setFeatParam('countY', 1)
  g().setFeatParam('countZ', 1)
  await g().commitFeatDlg()
  assert.match(g().status, /矩形陣列：先在 Objects 按「選擇」確認活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /矩形阵列：先在|環形陣列：先在|Face Pattern/)
  assert.ok(g().featDlg, 'dialog stays open on objectPicked refuse')
  assert.equal(g().features.some((f) => f.type === 'pattern'), false)
  assert.deepEqual(g().features, before)
})

// ── minradius no-solid (≠ more47 access / more43 measure-volume) ──

test('runtime: minradius without solid Formal 最小曲率半徑：需要活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().inspectInfo, null)
  await g().runCommand('minradius', '最小曲率半徑')
  assert.match(g().status, /最小曲率半徑：需要活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /最小曲率半径：需要活动实体|請先建立一個實體/)
  assert.equal(g().inspectInfo, null)
  assert.deepEqual(g().features, before)
})

// ── replaceface no-solid (≠ more44 delface / more43 moveface-nopick) ──

test('runtime: replaceface without solid Formal 替換面：要先有實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('replaceface', '替換面')
  assert.match(g().status, /替換面：要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /替换面：要先有实体|請先建立一個實體/)
  assert.equal(g().replaceFaceMode, false)
  assert.deepEqual(g().features, before)
})

// ── rotateface no-solid (≠ more43 moveface / more46 draft) ──

test('runtime: rotateface without solid Formal 旋轉面：要先有實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('rotateface', '旋轉面')
  assert.match(g().status, /旋轉面：要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /旋转面：要先有实体|請先建立一個實體/)
  assert.equal(g().rotateFaceMode, false)
  assert.deepEqual(g().features, before)
})

// ── draftanalysis no-solid (≠ more40 draft angle / more46 draft-no-solid / more47 access) ──

test('runtime: draftanalysis without solid Formal 拔模分析：需要先有有 B-rep 面的活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().draftResult, null)
  await g().runCommand('draftanalysis', '拔模分析')
  assert.match(g().status, /拔模分析：需要先有有 B-rep 面的活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /拔模分析：需要先有有 B-rep 面的活动实体|請先建立一個實體/)
  assert.equal(g().draftResult, null)
  assert.deepEqual(g().features, before)
})
