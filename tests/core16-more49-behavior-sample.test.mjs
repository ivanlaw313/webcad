/**
 * BOT-D more49 / FISHING92+ — CORE16 true behavior / regression gaps on tip 2e828080.
 * Complements smoke-21 + more34–more48 samples without duplicating those topics.
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
 * more48: MATERIALS+F88/F91, offsetsolid/ucs/splitplane/slicepreview-no-solid, surftrim/untrim-empty,
 * formsubdiv-no-cage, extrude-edit-h0, rect-objectPicked0, minradius/replaceface/rotateface/
 * draftanalysis-no-solid.
 * Focus here: editface/extendface/offsetface/splitface/silhouettesplit no-solid · facefillet no-solid ·
 * slopeanalysis/overhang/wallcheck no-solid · combine no-tool · surfsew-empty · formbridge stub ·
 * thicken no-solid.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F92 ja locale 離型到達性
 * (≠ more48 F91 jaLoc アクセス解析 trio).
 * Hand-off: FISHING94 cherry (more48 → F93; more47 on F92; do NOT target F92/F93).
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

// ── always-hard: MATERIALS + F88 / F92 ──

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

test('always-hard: FISHING92 ja locale Formal 離型到達性 (≠ more48 F91 アクセス解析)', () => {
  const jaLabels = rd('src/i18n/jaLabels.ts')
  const jaLoc = rd('src/i18n/locales/ja.ts')
  assert.match(jaLabels, /"可达性分析": "離型到達性"/)
  assert.match(jaLabels, /"可達性分析": "離型到達性"/)
  assert.match(jaLoc, /"cmd.accessanalysis": "離型到達性"/)
  assert.match(jaLoc, /"tool.accessanalysis": "離型到達性"/)
  assert.match(jaLoc, /"alias.accessanalysis": "離型到達性/)
  assert.doesNotMatch(jaLabels, /"可达性分析": "脱模可达性"/)
  assert.doesNotMatch(jaLoc, /"cmd.accessanalysis": "アクセス解析"/)
  assert.doesNotMatch(jaLoc, /"tool.accessanalysis": "アクセス解析"/)
})

// ── editface no-solid (≠ more48 replaceface/rotateface / more43 moveface) ──

test('runtime: editface without solid Formal 編輯面：先要有實體; no moveFaceMode', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().moveFaceMode, false)
  await g().runCommand('editface', '編輯面')
  assert.match(g().status, /編輯面：先要有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /编辑面：先要有实体|移動面：要先有實體|替換面：要先有實體/)
  assert.equal(g().moveFaceMode, false)
  assert.deepEqual(g().features, before)
})

// ── extendface no-solid (≠ more42 offsetsurf dist0 / more48 surftrim) ──

test('runtime: extendface without solid Formal 曲面延伸：要先有實體\/曲面件', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('extendface', '曲面延伸')
  assert.match(g().status, /曲面延伸：要先有實體\/曲面件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲面延伸：要先有实体|偏移曲面：要先有|平面裁剪：沒有曲面/)
  assert.equal(g().extendSurfMode, false)
  assert.deepEqual(g().features, before)
})

// ── offsetface no-solid (≠ more43 moveface-nopick / more48 rotateface) ──

test('runtime: offsetface without solid Formal 偏移面：要先有實體; no moveFaceMode', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('offsetface', '偏移面')
  assert.match(g().status, /偏移面：要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /偏移面：要先有实体|整體偏移需要先有實體|移動面：要先有實體/)
  assert.equal(g().moveFaceMode, false)
  assert.deepEqual(g().features, before)
})

// ── splitface no-solid (≠ more48 splitplane / more43 split-blank) ──

test('runtime: splitface without solid Formal 分割面：要先有實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('splitface', '分割面')
  assert.match(g().status, /分割面：要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /分割面：要先有实体|任意平面切需要先有實體|分割需要先有/)
  assert.equal(g().splitFaceMode, false)
  assert.deepEqual(g().features, before)
})

// ── silhouettesplit no-solid (≠ more48 splitplane / more46 split-OOR) ──

test('runtime: silhouettesplit without solid Formal 輪廓分割需要先有實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('silhouettesplit', '輪廓分割')
  assert.match(g().status, /輪廓分割需要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /轮廓分割需要先有实体|任意平面切|請先切換到前/)
  assert.equal(g().features.some((f) => f.type === 'silhouettesplit'), false)
  assert.deepEqual(g().features, before)
})

// ── facefillet no-solid (≠ more47 chamfer/shell / more37 fillet gate) ──

test('runtime: facefillet without solid Formal 面圓角：先要有零件實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().faceFilletMode, false)
  await g().runCommand('facefillet', '面圓角')
  assert.match(g().status, /面圓角：先要有零件實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /面圆角：先要有零件实体|請先建立一個實體|^圓角：先要有零件實體/)
  assert.equal(g().faceFilletMode, false)
  assert.deepEqual(g().features, before)
})

// ── slopeanalysis no-solid (≠ more48 draftanalysis / more47 access) ──

test('runtime: slopeanalysis without solid Formal 斜度分析：需要先有有 B-rep 面的活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().slopeResult, null)
  await g().runCommand('slopeanalysis', '斜度分析')
  assert.match(g().status, /斜度分析：需要先有有 B-rep 面的活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /斜度分析：需要先有有 B-rep 面的活动实体|拔模分析：需要先有|脫模可達性：需要/)
  assert.equal(g().slopeResult, null)
  assert.deepEqual(g().features, before)
})

// ── overhang no-solid (≠ more48 draftanalysis / more47 access) ──

test('runtime: overhang without solid Formal 懸垂分析需要一個活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().overhang, null)
  await g().runCommand('overhang', '懸垂分析')
  assert.match(g().status, /懸垂分析需要一個活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /悬垂分析需要一个活动实体|壁厚檢查需要|自動擺正需要/)
  assert.equal(g().overhang, null)
  assert.deepEqual(g().features, before)
})

// ── wallcheck no-solid (≠ more40 shell thickness / more48 draftanalysis) ──

test('runtime: wallcheck without solid Formal 壁厚檢查需要一個活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().wallThin, null)
  await g().runCommand('wallcheck', '壁厚檢查')
  assert.match(g().status, /壁厚檢查需要一個活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /壁厚检查需要一个活动实体|懸垂分析需要|壁厚必須大於 0/)
  assert.equal(g().wallThin, null)
  assert.deepEqual(g().features, before)
})

// ── combine no-tool (≠ more40 combine empty / more46 boundaryfill) ──

test('runtime: combine without parked Formal 合併：沒有工具體; no dlg', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('combine', '合併')
  assert.match(g().status, /合併：沒有工具體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /合并：没有工具体|Boundary Fill：需要|請先建立一個實體/)
  assert.equal(g().featDlg, null)
  assert.equal(g().features.some((f) => f.type === 'combine' || f.type === 'boolean'), false)
  assert.deepEqual(g().features, before)
})

// ── surfsew empty (≠ more47 surfunstitch / more48 surftrim) ──

test('runtime: surfsew without parked Formal refuse; no surfsew', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('surfsew', '曲面縫合')
  assert.match(g().status, /曲面縫合 Stitch：先做曲面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲面缝合|取消縫合 Unstitch|平面裁剪：沒有曲面/)
  assert.equal(g().features.some((f) => f.type === 'surfsew'), false)
  assert.deepEqual(g().features, before)
})

// ── formbridge stub (≠ more47 formmirror / more48 formsubdiv) ──

test('runtime: formbridge Formal Bridge（FORM）尚未支援; no formCage', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formCage, null)
  await g().runCommand('formbridge', '造型橋接')
  assert.match(g().status, /Bridge（FORM）：T-spline 橋接尚未支援/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /鏡像：請先建立一個造型|細分：請先建立|Weld（FORM）/)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

// ── thicken no-solid (≠ more42 thicken missing / more41 quilt 0 / more47 thickenquilt) ──

test('runtime: thicken without solid Formal 加厚：要先有實體\/曲面件', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('thicken', '加厚')
  assert.match(g().status, /加厚：要先有實體\/曲面件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /加厚：要先有实体|加厚曲面：沒有曲面|加厚厚度必須大於 0/)
  assert.equal(g().thickenMode, false)
  assert.deepEqual(g().features, before)
})
