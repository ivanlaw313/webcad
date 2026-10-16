/**
 * BOT-D more50 / FISHING92+ — CORE16 true behavior / regression gaps on tip 2e828080.
 * Complements smoke-21 + more34–more49 samples without duplicating those topics.
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
 * more49: MATERIALS+F88/F92, editface/extendface/offsetface/splitface/silhouettesplit-no-solid,
 * facefillet-no-solid, slopeanalysis/overhang/wallcheck-no-solid, combine-no-tool, surfsew-empty,
 * formbridge-stub, thicken-no-solid.
 * Focus here: formweld/formfillhole/formerasefill stubs · removefaces/moveface/offsetsurf no-solid ·
 * extrude/revolve no-sketch · autoorient no-solid · joint <2 · meshfit no-mesh · groundcomp no-select ·
 * asbuiltjoint checked≠2.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F91 jaLabels 離型到達性
 * (≠ more49 F92 jaLoc cmd/tool/alias trio).
 * Hand-off: FISHING95 cherry (more49 → F94; more48 → F93; do NOT target F93/F94).
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

// ── always-hard: MATERIALS + F88 / F91 jaLabels ──

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

test('always-hard: FISHING91 jaLabels Formal 離型到達性 (≠ more49 F92 jaLoc cmd/tool)', () => {
  const jaLabels = rd('src/i18n/jaLabels.ts')
  assert.match(jaLabels, /"可达性分析": "離型到達性"/)
  assert.match(jaLabels, /"可達性分析": "離型到達性"/)
  assert.doesNotMatch(jaLabels, /"可达性分析": "脱模可达性"/)
  assert.doesNotMatch(jaLabels, /"可達性分析": "脱模可达性"/)
  assert.doesNotMatch(jaLabels, /"可达性分析": "アクセス解析"/)
  assert.doesNotMatch(jaLabels, /"可達性分析": "アクセス解析"/)
})

// ── formweld stub (≠ more49 formbridge / more48 formsubdiv / more47 formmirror) ──

test('runtime: formweld Formal Weld（FORM）尚未支援; no formCage', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formCage, null)
  await g().runCommand('formweld', '造型焊接')
  assert.match(g().status, /Weld（FORM）：頂點焊接尚未支援/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Bridge（FORM）|Fill Hole（FORM）|細分：請先建立/)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

// ── formfillhole stub (≠ more49 formbridge / more48 formsubdiv) ──

test('runtime: formfillhole Formal Fill Hole（FORM）尚未支援; no formCage', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formCage, null)
  await g().runCommand('formfillhole', '造型補洞')
  assert.match(g().status, /Fill Hole（FORM）：補洞尚未支援/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Weld（FORM）|Erase & Fill|Bridge（FORM）/)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

// ── formerasefill stub (≠ more49 formbridge / more47 formmirror) ──

test('runtime: formerasefill Formal Erase & Fill（FORM）尚未支援; no formCage', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formCage, null)
  await g().runCommand('formerasefill', '造型擦除填充')
  assert.match(g().status, /Erase & Fill（FORM）：尚未支援/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Fill Hole（FORM）|Weld（FORM）|鏡像：請先建立/)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

// ── removefaces no-solid (≠ more44 delface-nopick / more49 editface) ──

test('runtime: removefaces without solid Formal 刪除面：先要有實體; no delFaceMode', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().delFaceMode, false)
  await g().runCommand('removefaces', '刪除面')
  assert.match(g().status, /刪除面：先要有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /删除面：先要有实体|刪面：要先有實體|編輯面：先要有實體/)
  assert.equal(g().delFaceMode, false)
  assert.deepEqual(g().features, before)
})

// ── moveface no-solid (≠ more43 moveface-nopick / more48 rotateface / more49 offsetface) ──

test('runtime: moveface without solid Formal 移動面：要先有實體; no moveFaceMode', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().moveFaceMode, false)
  await g().runCommand('moveface', '移動面')
  assert.match(g().status, /移動面：要先有實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /移动面：要先有实体|偏移面：要先有實體|旋轉面：要先有實體|請先點選要移動的面/)
  assert.equal(g().moveFaceMode, false)
  assert.deepEqual(g().features, before)
})

// ── offsetsurf no-solid (≠ more42 offsetsurf dist0 / more49 extendface/thicken) ──

test('runtime: offsetsurf without solid Formal 偏移曲面：要先有實體\/曲面件', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('offsetsurf', '偏移曲面')
  assert.match(g().status, /偏移曲面：要先有實體\/曲面件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /偏移曲面：要先有实体|曲面延伸：要先有|加厚：要先有|偏移距離必須/)
  assert.equal(g().offsetSurfMode, false)
  assert.deepEqual(g().features, before)
})

// ── extrude no-sketch (≠ more48 extrude-edit-h0 / more38 extrude dist) ──

test('runtime: extrude without sketch Formal 拉伸需要先畫一個草圖輪廓; no dlg', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('extrude', '拉伸')
  assert.match(g().status, /拉伸需要先畫一個草圖輪廓/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请输入非零拉伸距离|請輸入非零拉伸距離|旋轉需要先畫/)
  assert.equal(g().featDlg, null)
  assert.equal(g().extrudeDlgOpen, false)
  assert.deepEqual(g().features, before)
})

// ── revolve no-sketch (≠ more34 revolve refuse angle / more39 revolve cut) ──

test('runtime: revolve without sketch Formal 旋轉需要先畫一個草圖輪廓; no dlg', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('revolve', '旋轉')
  assert.match(g().status, /旋轉需要先畫一個草圖輪廓/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /旋转需要先画|拉伸需要先畫|角度必須/)
  assert.equal(g().featDlg, null)
  assert.deepEqual(g().features, before)
})

// ── autoorient no-solid (≠ more49 overhang/wallcheck / more47 access) ──

test('runtime: autoorient without solid Formal 自動擺正需要一個活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().overhang, null)
  await g().runCommand('autoorient', '自動擺正')
  assert.match(g().status, /自動擺正需要一個活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /自动摆正需要一个活动实体|懸垂分析需要|壁厚檢查需要|脫模可達性：需要/)
  assert.equal(g().overhang, null)
  assert.deepEqual(g().features, before)
})

// ── joint <2 comps (≠ more40 F69 motionlink / more41 planComponentMove) ──

test('runtime: joint with <2 components Formal 關節需要≥2個組件; no jointPick', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  await g().runCommand('joint', '關節')
  assert.match(g().status, /關節需要≥2個組件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /关节需要|關節拾取需要|按現狀關節|運動連結：需要最少/)
  assert.equal(g().jointPickMode, false)
  assert.deepEqual(g().features, before)
})

// ── meshfit no mesh (≠ more47 scale-no-solid / more36 importStep) ──

test('runtime: meshfit without mesh Formal MeshFit／轉 B-rep：先插入 STL\/OBJ', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  await g().runCommand('meshfit', 'MeshFit')
  assert.match(g().status, /MeshFit \/ 轉 B-rep：先插入 STL\/OBJ 網格/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /MeshFit \/ 转 B-rep|組件布爾：請先|使用基本體替換/)
  assert.equal(g().selectedComponent, null)
  assert.deepEqual(g().features, before)
})

// ── groundcomp no select (≠ more41 planComponentMove / more39 tip.align) ──

test('runtime: groundcomp without selection Formal 固定組件：請先選取; no ground flip', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().selectedComponent, null)
  await g().runCommand('groundcomp', '固定組件')
  assert.match(g().status, /固定組件：請先在瀏覽器或視窗中選取一個組件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /固定组件|關節需要≥2|按現狀關節/)
  assert.equal(g().selectedComponent, null)
  assert.deepEqual(g().features, before)
})

// ── asbuiltjoint checked≠2 (≠ more40 motionlink / joint <2 above) ──

test('runtime: asbuiltjoint without exactly 2 checked Formal 按現狀關節 refuse', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().checkedComps.length, 0)
  await g().runCommand('asbuiltjoint', '按現狀關節')
  assert.match(g().status, /按現狀關節：先在瀏覽器勾選剛好 2 個組件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /按现状关节|關節需要≥2|新建接觸集：先在瀏覽器/)
  assert.equal(g().joints.length, 0)
  assert.deepEqual(g().features, before)
})
