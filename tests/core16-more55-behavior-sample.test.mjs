/**
 * BOT-D more55 / FISHING98+ — CORE16 true behavior / regression gaps on tip af832844 (F98).
 * Complements smoke-21 + more34–more54 samples without duplicating those topics.
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
 * more54: MATERIALS+F88/F94 demold prefix, formquadball/formpipe/formface stubs · holepts · bom ·
 * exportasmstl · sectionprops · midcpoint · align · exportdxf · exportobj · insertfastener-bad-type ·
 * removefeatures-bad-maxD.
 * Focus here: formbox/formcyl/formplane/formsphere/formtorus/formpatch bad-input · lasergcode ·
 * finish3d · properties · stack · arrangebed · facemate · newcomp.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F94 demold status
 * prefix pins (JA 離型到達性… / EN Demold Accessibility…；≠ more54 exact trio themes =
 * the 13 runtime gaps differ from more54 formquadball/formpipe/formface/holepts sample).
 * Base: FISHING98 tip af832844（more53 soft 926bae85 on F98；more54 a801a85c → F99）.
 * Hand-off: FISHING100 cherry (more54 → F99; more53 on F98; do NOT target F98/F99).
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

test('always-hard: FISHING94 demold status prefix pins JA 離型到達性… / EN Demold Accessibility… (≠ more54 formquadball\/formpipe\/holepts themes)', async () => {
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

// ── formbox / formcyl / formplane / formsphere / formtorus / formpatch bad-input
// (≠ more51 formsketch/formloop · more52 formextrude · more54 formquadball/formpipe/formface stubs) ──

test('runtime: formbox bad dims Formal Form 盒：請輸入 6 個正數（長,闊,高,X段,Y段,Z段）', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formMode, false)
  assert.equal(g().formCage, null)
  useApp.setState({ appPrompt: async () => '0,0,0' })
  await g().runCommand('formbox', 'Form 盒')
  assert.match(g().status, /Form 盒：請輸入 6 個正數（長,闊,高,X段,Y段,Z段）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /四邊形球體：|造型管道：|造型面：選基準平面|FORM T-spline|Form 圓柱：/)
  assert.equal(g().formMode, false)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

test('runtime: formcyl bad dims Formal Form 圓柱：請輸入 半徑,高,周向段,高度段（正數）', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ appPrompt: async () => '-1,20' })
  await g().runCommand('formcyl', 'Form 圓柱')
  assert.match(g().status, /Form 圓柱：請輸入 半徑,高,周向段,高度段（正數）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Form 盒：|造型圓柱：先選基準平面|FORM T-spline|四邊形球體：/)
  assert.equal(g().formMode, false)
  assert.deepEqual(g().features, before)
})

test('runtime: formplane bad dims Formal Form 平面：請輸入 長,闊,X段,Y段（正數）', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ appPrompt: async () => '40,0' })
  await g().runCommand('formplane', 'Form 平面')
  assert.match(g().status, /Form 平面：請輸入 長,闊,X段,Y段（正數）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Form 盒：|Form 圓柱：|造型平面：先選基準平面|FORM T-spline/)
  assert.equal(g().formMode, false)
  assert.deepEqual(g().features, before)
})

test('runtime: formsphere bad radius Formal Form 球：請輸入 半徑\[,段數\]（正數）', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ appPrompt: async () => '0' })
  await g().runCommand('formsphere', 'Form 球')
  assert.match(g().status, /Form 球：請輸入 半徑\[,段數\]（正數）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Form 盒：|造型球：選基準平面|FORM T-spline|四邊形球體：/)
  assert.equal(g().formMode, false)
  assert.deepEqual(g().features, before)
})

test('runtime: formtorus tube≥main Formal Form 環面：請輸入 主半徑,管半徑（主>管>0）', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ appPrompt: async () => '10,10' })
  await g().runCommand('formtorus', 'Form 環面')
  assert.match(g().status, /Form 環面：請輸入 主半徑,管半徑（主>管>0）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Form 球：|造型圓環：選基準平面|FORM T-spline|四邊形球體：/)
  assert.equal(g().formMode, false)
  assert.deepEqual(g().features, before)
})

test('runtime: formpatch bad dims Formal Form 開放曲面片：請輸入 長,闊,X段,Y段（正數）', async () => {
  reset()
  const before = structuredClone(g().features)
  useApp.setState({ appPrompt: async () => '-5,40' })
  await g().runCommand('formpatch', 'Form 開放曲面片')
  assert.match(g().status, /Form 開放曲面片：請輸入 長,闊,X段,Y段（正數）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Form 平面：|造型面：選基準平面並設長、闊及細分|FORM T-spline|四邊形球體：/)
  assert.equal(g().formMode, false)
  assert.deepEqual(g().features, before)
})

// ── lasergcode no sketch (≠ more54 exportdxf / more53 exportflatdxf) ──

test('runtime: lasergcode without sketch Formal 激光 G-code：先畫一個封閉草圖輪廓', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().sketchProfiles.length, 0)
  assert.equal(g().sketchShape, null)
  assert.equal(g().laserDlg, false)
  await g().runCommand('lasergcode', '激光 G-code')
  assert.match(g().status, /激光 G-code：先畫一個封閉草圖輪廓（矩形\/圓\/折線…），再匯出/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /DXF 匯出：|展開 DXF：|3D 加工：/)
  assert.equal(g().laserDlg, false)
  assert.deepEqual(g().features, before)
})

// ── finish3d no body (≠ more52 computeall / more50 meshfit) ──

test('runtime: finish3d without body Formal 3D 加工：先要有活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh?.vertices?.length, false)
  assert.equal(g().components.length, 0)
  assert.equal(g().finish3dDlg, false)
  await g().runCommand('finish3d', '3D 精加工')
  assert.match(g().status, /3D 加工：先要有活動實體（Solid 或 Mesh→B-rep）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /激光 G-code：|MeshFit \/ 轉 B-rep：|目前只有網格組件/)
  assert.equal(g().finish3dDlg, false)
  assert.deepEqual(g().features, before)
})

// ── properties no body (≠ more54 bom / more53 drawing) ──

test('runtime: properties without body Formal 屬性：需要活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh?.triangles?.length, false)
  assert.equal(g().selectedComponent, null)
  assert.equal(g().propsDialog, null)
  await g().runCommand('properties', '屬性')
  assert.match(g().status, /屬性：需要活動實體（或在瀏覽器選一個組件右鍵屬性）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /BOM 需要實體|工程圖需要先有|屬性：該組件無實體幾何/)
  assert.equal(g().propsDialog, null)
  assert.deepEqual(g().features, before)
})

// ── stack / arrangebed <2 comps (≠ more51 arrange checked≥2) ──

test('runtime: stack with <2 Formal 垂直堆疊需要 ≥2 個可見有實體組件', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  await g().runCommand('stack', '垂直堆疊')
  assert.match(g().status, /垂直堆疊需要 ≥2 個可見有實體組件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /排版需要 ≥2|排列：請先在瀏覽器勾選 ≥2|剛性組：/)
  assert.deepEqual(g().features, before)
})

test('runtime: arrangebed with <2 Formal 排版需要 ≥2 個可見有實體組件', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  await g().runCommand('arrangebed', '排版打印')
  assert.match(g().status, /排版需要 ≥2 個可見有實體組件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /垂直堆疊需要 ≥2|排列：請先在瀏覽器勾選 ≥2|整體縮放需要裝配/)
  assert.deepEqual(g().features, before)
})

// ── facemate persistent Formal (≠ more54 align oneShot / more39 tip.align) ──

test('runtime: facemate Formal 面貼合：先點【基準件】一個面', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().faceMateMode, false)
  assert.equal(g().faceMateOneShot, false)
  await g().runCommand('facemate', '面貼合')
  assert.match(g().status, /面貼合：先點【基準件】一個面（平面 或 圓柱孔\/軸），再點【要移動件】對應面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /對齊：點【基準面】再點【要移動件】|剛性組：|按現狀關節：/)
  assert.equal(g().faceMateMode, true)
  assert.equal(g().faceMateOneShot, false)
  assert.deepEqual(g().features, before)
})

// ── newcomp no body (≠ more53 newbody / more51 basefeature) ──

test('runtime: newcomp without body Formal 當前沒有實體——先建一個，再「新建組件」', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh, false)
  assert.equal(g().components.length, 0)
  await g().runCommand('newcomp', '新建組件')
  assert.match(g().status, /當前沒有實體——先建一個，再「新建組件」/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /新實體：先起一個實體|基底特徵：|已固化/)
  assert.equal(g().components.length, 0)
  assert.deepEqual(g().features, before)
})
