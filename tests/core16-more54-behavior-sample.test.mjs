/**
 * BOT-D more54 / FISHING96+ — CORE16 true behavior / regression gaps on tip 3f7ecdc1 (F97).
 * Complements smoke-21 + more34–more53 samples without duplicating those topics.
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
 * more40: MATERIALS+F70 控製→控制 + F69 運動連結 tip pins, draft angle, shell thickness-0, pipe wall≥R,
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
 * more50: MATERIALS+F88/F91 jaLabels, formweld/formfillhole/formerasefill stubs,
 * removefaces/moveface/offsetsurf-no-solid, extrude/revolve no-sketch, autoorient-no-solid,
 * joint<2, meshfit-no-mesh, groundcomp-no-select, asbuiltjoint-checked≠2.
 * more51: MATERIALS+F88/F93 demold catalog, formloop/formcrease/formedit/formsketch/formrepair/
 * forminsert stubs · createpcb · basefeature-no-solid · arrange<2 · presspull-empty ·
 * scaleasm-no-asm · newcontactset-checked≠2 · motionstudy-no-joint.
 * more52: MATERIALS+F88/F94 demold prefix, formextrude/formrevolve/formsweep/formloft stubs ·
 * vollattice/voltexture/volmodify · computeall-empty · computeunresolved · delete-no-sel ·
 * remove-no-comp · jointpick<2 · drivejoints-no-joint.
 * more53: MATERIALS+F88/F94 demold prefix, replaceprimitives · compboolean · newbody · rigidgroup ·
 * motionlink-runtime · projsurf · exportflatdxf · drawing · asmdrawing · holecpts · splitsketch ·
 * sweepedge · formMode-finishForm-gate.
 * Focus here: formquadball/formpipe/formface stubs · holepts · bom · exportasmstl · sectionprops ·
 * midcpoint · align · exportdxf · exportobj · insertfastener-bad-type · removefeatures-bad-maxD.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F94 demold status
 * prefix pins (JA 離型到達性… / EN Demold Accessibility…；≠ more53 exact trio themes =
 * the 13 runtime gaps differ from more53 replaceprimitives/compboolean/newbody sample).
 * Base: FISHING97 tip 3f7ecdc1（草圖：base 等 F96／F97 tip 對齊 — F97 appeared → rebase onto F97 HEAD）.
 * Hand-off: FISHING99 cherry (more53 → F98; more52 → F97; more51 on F96;
 * do NOT target F96/F97/F98).
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
const { tStatus } = await import('../src/i18n.ts')
const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () =>
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

// ── always-hard: MATERIALS + F88 / F94 demold status prefix ──

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

test('always-hard: FISHING94 demold status prefix pins JA 離型到達性… / EN Demold Accessibility… (≠ more53 replaceprimitives\/compboolean themes)', async () => {
  const i18n = rd('src/i18n.ts')
  assert.match(i18n, /FISHING94: status result sentences still start with TC/)
  assert.match(i18n, /s\.includes\('脫模可達性'\) \|\| s\.includes\('脱模可达性'\)/)
  assert.match(i18n, /s\.split\('脫模可達性'\)\.join\(name\)\.split\('脱模可达性'\)\.join\(name\)/)
  const once = i18n.slice(i18n.indexOf('function tStatusOnce'))
  const prefixAt = once.indexOf("s.includes('脫模可達性')")
  const exactAt = once.indexOf('const exact = _STATUS_EXACT[s]')
  assert.ok(prefixAt >= 0 && exactAt > prefixAt, 'F94 prefix replace before EN exact')
  assert.equal(tStatus('脫模可達性：需要活動實體', 'ja'), '離型到達性：需要活動實體')
  assert.equal(tStatus('脫模可達性：需要活動實體', 'en'), 'Demold Accessibility：需要活動實體')
  assert.equal(tStatus('脱模可达性：需要活動實體', 'ja'), '離型到達性：需要活動實體')
  assert.equal(tStatus('脫模可達性：脫模方向不可是零向量', 'ja'), '離型到達性：脫模方向不可是零向量')
  assert.match(tStatus('🔓 脫模可達性', 'ja'), /離型到達性/)
  assert.match(tStatus('🔓 脫模可達性', 'en'), /Demold Accessibility/)
  assert.equal(tStatus('脫模可達性：需要活動實體', 'zh-HK'), '脫模可達性：需要活動實體')
})

// ── formquadball / formpipe / formface stubs (≠ more51 formsketch / more52 formextrude / more50 formweld) ──

test('runtime: formquadball Formal 四邊形球體：選基準平面並設半徑／細分', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formCreateKind, null)
  await g().runCommand('formquadball', '四邊形球體')
  assert.match(g().status, /四邊形球體：選基準平面並設半徑／細分/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /FORM T-spline|造型環境內「建立草圖」|Weld（FORM）|造型管道：/)
  assert.equal(g().formCreateKind, 'quadball')
  assert.deepEqual(g().features, before)
})

test('runtime: formpipe Formal 造型管道：輸入 3D 路徑點、圓形截面直徑與面數', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formpipe', '管道')
  assert.match(g().status, /造型管道：輸入 3D 路徑點、圓形截面直徑與面數，建立可編輯的開放端細分控制籠/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /FORM T-spline|四邊形球體：|造型面：選基準平面/)
  assert.equal(g().formCreateKind, 'pipe')
  assert.deepEqual(g().features, before)
})

test('runtime: formface Formal 造型面：選基準平面並設長、闊及細分', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formface', '面')
  assert.match(g().status, /造型面：選基準平面並設長、闊及細分/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /FORM T-spline|造型管道：|四邊形球體：|Form 開放曲面片/)
  assert.equal(g().formCreateKind, 'face')
  assert.deepEqual(g().features, before)
})

// ── holepts no sketch points (≠ more53 holecpts / more37 hole gate) ──

test('runtime: holepts without sketch points Formal 找不到含草圖點的 XY 草圖', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().mode !== 'sketch' || true, true)
  await g().runCommand('holepts', '草圖點批量孔')
  assert.match(g().status, /找不到含草圖點的 XY 草圖 — 用「點」工具在草圖落點（每點一孔），或用「孔」對話框的螺栓圈/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /構造點批量孔：沒有構造點|孔需要先有一個實體|批量孔：先要有實體/)
  assert.deepEqual(g().features, before)
})

// ── bom no body (≠ more53 drawing / asmdrawing) ──

test('runtime: bom without body\/components Formal BOM 需要實體或裝配組件', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh?.vertices?.length, false)
  assert.equal(g().components.length, 0)
  assert.equal(g().bomDialog, null)
  await g().runCommand('bom', 'BOM 表')
  assert.match(g().status, /BOM 需要實體或裝配組件（先建模，或載入「齒輪組\/軸承」等模板）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /工程圖需要先有|裝配工程圖：|已打開/)
  assert.equal(g().bomDialog, null)
  assert.deepEqual(g().features, before)
})

// ── exportasmstl no geometry (≠ more53 exportflatdxf / more44 sheetmetal) ──

test('runtime: exportasmstl without geometry Formal 沒有可匯出的幾何', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  assert.equal(!!g().bodyMesh, false)
  await g().runCommand('exportasmstl', '匯出裝配STL')
  assert.match(g().status, /沒有可匯出的幾何/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /展開 DXF：|沒有可匯出的實體，請先建模|真布爾合併需要/)
  assert.deepEqual(g().features, before)
})

// ── sectionprops no closed profile (≠ more48 slicepreview / more41 measure) ──

test('runtime: sectionprops without closed profile Formal 截面屬性：草圖裏沒有封閉輪廓', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().sketchProfiles.length, 0)
  assert.equal(g().sectionResult, null)
  await g().runCommand('sectionprops', '截面屬性')
  assert.match(g().status, /截面屬性：草圖裏沒有封閉輪廓（構造\/開放線不計）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /切層預覽需要|剖面截面屬性：|面積 /)
  assert.equal(g().sectionResult, null)
  assert.deepEqual(g().features, before)
})

// ── midcpoint <2 cpoints (≠ more53 holecpts / more43 mate-cancel) ──

test('runtime: midcpoint with <2 cpoints Formal 中點：先落 2 個構造點', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().cpoints.length, 0)
  await g().runCommand('midcpoint', '兩點中點')
  assert.match(g().status, /中點：先落 2 個構造點（用最後 2 個）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /三點平面：|兩點軸：|構造點批量孔：/)
  assert.equal(g().cpoints.length, 0)
  assert.deepEqual(g().features, before)
})

// ── align one-shot start Formal (≠ more39 tip.align / more50 asbuilt / more53 rigidgroup) ──

test('runtime: align Formal 對齊：點【基準面】再點【要移動件】的面', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().faceMateMode, false)
  await g().runCommand('align', '對齊')
  assert.match(g().status, /對齊：點【基準面】再點【要移動件】的面（平面貼平 \/ 圓柱同軸）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /面貼合：先點【基準件】|剛性組：|按現狀關節：/)
  assert.equal(g().faceMateMode, true)
  assert.equal(g().faceMateOneShot, true)
  assert.deepEqual(g().features, before)
})

// ── exportdxf no sketch (≠ more53 exportflatdxf / more40 surfextrude) ──

test('runtime: exportdxf without sketch Formal DXF 匯出：先畫一個草圖輪廓', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().sketchProfiles.length, 0)
  assert.equal(g().sketchShape, null)
  await g().runCommand('exportdxf', '匯出 DXF')
  assert.match(g().status, /DXF 匯出：先畫一個草圖輪廓（矩形\/圓\/折線…），再匯出/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /展開 DXF：|激光 G-code：|沒有可匯出的幾何/)
  assert.deepEqual(g().features, before)
})

// ── exportobj no body (≠ more53 drawing / exportasmstl above) ──

test('runtime: exportobj without body Formal 沒有可匯出的實體，請先建模', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh?.vertices?.length, false)
  assert.equal(g().components.length, 0)
  await g().runCommand('exportobj', '匯出 OBJ')
  assert.match(g().status, /沒有可匯出的實體，請先建模/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /此設計是裝配（多組件）|沒有可匯出的幾何|已匯出 OBJ/)
  assert.deepEqual(g().features, before)
})

// ── insertfastener bad type (≠ more51 createpcb / more50 meshfit) ──

test('runtime: insertfastener invalid type Formal 插入緊固件：請輸入有效類型編號', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ appPrompt: async () => '99' })
  await g().runCommand('insertfastener', '插入緊固件')
  assert.match(g().status, /插入緊固件：請輸入有效類型編號/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Create PCB：|MeshFit \/ 轉 B-rep：|規格必須是/)
  assert.equal(g().components.length, 0)
  assert.deepEqual(g().features, before)
})

// ── removefeatures bad maxD (≠ more52 delete-no-sel / more50 removefaces) ──

test('runtime: removefeatures non-positive maxD Formal 刪除特徵：最大孔徑必須是正數 mm', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().selectedFeature, null)
  assert.equal(g().selectedFeatures.length, 0)
  useApp.setState({ appPrompt: async () => '0' })
  await g().runCommand('removefeatures', '刪除特徵')
  assert.match(g().status, /刪除特徵：最大孔徑必須是正數 mm/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /先選中一個特徵|刪除面：先要有實體|沒有找到 Ø/)
  assert.deepEqual(g().features, before)
  assert.deepEqual(g().suppressedIds, [])
})
