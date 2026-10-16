/**
 * BOT-D more53 / FISHING95+ — CORE16 true behavior / regression gaps on tip 42b98c63.
 * Complements smoke-21 + more34–more52 samples without duplicating those topics.
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
 * Focus here: replaceprimitives · compboolean · newbody · rigidgroup · motionlink runtime ·
 * projsurf · exportflatdxf · drawing · asmdrawing · holecpts · splitsketch · sweepedge ·
 * formMode→solid refuse (commandDisabledReason finishForm).
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F94 demold status
 * prefix pins (JA 離型到達性… / EN Demold Accessibility…；≠ more52 exact trio themes =
 * the 13 runtime gaps differ from more52 form/vol/compute/delete sample).
 * Base: FISHING95 tip 42b98c63（草圖：base 等 F95 tip 再對齊 — done）.
 * Hand-off: FISHING98 cherry (more52 → F97; more51 → F96; more50 on F95;
 * do NOT target F95/F96/F97).
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

test('always-hard: FISHING94 demold status prefix pins JA 離型到達性… / EN Demold Accessibility… (≠ more52 form/vol/compute themes)', async () => {
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

// ── replaceprimitives no solid (≠ more50 meshfit / more51 basefeature) ──

test('runtime: replaceprimitives Formal 使用基本體替換：先建立一個活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh?.vertices?.length, false)
  await g().runCommand('replaceprimitives', '使用基本體替換')
  assert.match(g().status, /使用基本體替換：先建立一個活動實體；組件／網格會在後續版本支援/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /MeshFit \/ 轉 B-rep|Create Base Feature|組件布爾：/)
  assert.deepEqual(g().features, before)
})

// ── compboolean no component (≠ more50 meshfit / more40 combine empty / more49 combine-no-tool) ──

test('runtime: compboolean Formal 組件布爾：請先在瀏覽器選擇一個組件', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  assert.equal(g().selectedComponent, null)
  await g().runCommand('compboolean', '組件布爾')
  assert.match(g().status, /組件布爾：請先在瀏覽器選擇一個組件（目標件），再點此工具/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /MeshFit \/ 轉 B-rep|合併\/切割需要|Combine：/)
  assert.deepEqual(g().features, before)
})

// ── newbody no solid (≠ more51 basefeature / more50 groundcomp) ──

test('runtime: newbody Formal 新實體：先起一個實體（拉伸\/原語）', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  await g().runCommand('newbody', '新實體')
  assert.match(g().status, /新實體：先起一個實體（拉伸\/原語），才有實體可另存為獨立實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Create Base Feature|固定組件：|使用基本體替換/)
  assert.deepEqual(g().features, before)
})

// ── rigidgroup checked <2 (≠ more51 newcontactset / more50 asbuiltjoint / more52 jointpick) ──

test('runtime: rigidgroup with <2 checked Formal 剛性組：瀏覽樹勾選 ≥2 個組件先', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().checkedComps.length, 0)
  assert.equal(g().components.length, 0)
  await g().runCommand('rigidgroup', '剛性組')
  assert.match(g().status, /剛性組：瀏覽樹勾選 ≥2 個組件先/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /新建接觸集：|按現狀關節：|關節拾取需要/)
  assert.equal(g().joints.length, 0)
  assert.deepEqual(g().features, before)
})

// ── motionlink <2 revolute/cylindrical (≠ more40 tip Formal 運動連結 / more51 motionstudy / more52 drivejoints) ──

test('runtime: motionlink without revolute\/cylindrical Formal 運動連結：需要最少 2 個轉動／圓柱關節', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().joints.length, 0)
  const prevWin = globalThis.window
  globalThis.window = {
    ...(prevWin && typeof prevWin === 'object' ? prevWin : {}),
    dispatchEvent: () => true,
  }
  try {
    await g().runCommand('motionlink', '運動連結')
  } finally {
    globalThis.window = prevWin
  }
  assert.match(g().status, /運動連結：需要最少 2 個轉動／圓柱關節 — 已開啟關節面板運動連結區/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /運動研究需要|驅動關節：裝配內未有|關節需要≥2/)
  assert.equal(g().joints.length, 0)
  assert.deepEqual(g().features, before)
})

// ── projsurf not in sketch (≠ more40 surfextrude / more47 surfrevolve / more50 extrude-no-sketch) ──

test('runtime: projsurf outside sketch Formal 投影到圓柱面：請先入草圖並畫一條曲線', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.notEqual(g().mode, 'sketch')
  await g().runCommand('projsurf', '投影到圓柱面')
  assert.match(g().status, /投影到圓柱面：請先入草圖並畫一條曲線（開放折線\/樣條）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /拉伸需要先畫|曲面旋轉需要|曲面掃掠/)
  assert.deepEqual(g().features, before)
})

// ── exportflatdxf no sheetmetal (≠ more44 sheetmetal-t0 / more48 slicepreview) ──

test('runtime: exportflatdxf without sheetmetal Formal 展開 DXF：先建一個鈑金件', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.some((f) => f.type === 'sheetmetal'), false)
  await g().runCommand('exportflatdxf', '展開 DXF')
  assert.match(g().status, /展開 DXF：先建一個鈑金件（SHEET METAL →「鈑金件」），再匯出展開圖/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /切層預覽需要|鈑金件：厚度|先選中一個特徵/)
  assert.deepEqual(g().features, before)
})

// ── drawing no body (≠ more48 slicepreview / more51 createpcb) ──

test('runtime: drawing without body Formal 工程圖需要先有一個活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh?.triangles?.length, false)
  assert.equal(g().components.length, 0)
  await g().runCommand('drawing', '工程圖')
  assert.match(g().status, /工程圖需要先有一個活動實體（先建模一個零件）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /裝配工程圖：|Create PCB|切層預覽需要/)
  assert.deepEqual(g().features, before)
})

// ── asmdrawing no visible components (≠ more51 arrange / more52 remove) ──

test('runtime: asmdrawing without components Formal 裝配工程圖：沒有可見組件', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  await g().runCommand('asmdrawing', '裝配工程圖')
  assert.match(g().status, /裝配工程圖：沒有可見組件（先「新建組件」砌一個裝配，或用單體工程圖）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /工程圖需要先有|排列：需要至少|移除：先在瀏覽器/)
  assert.deepEqual(g().features, before)
})

// ── holecpts no cpoints (≠ more37 hole gate / more50 extrude-no-sketch) ──

test('runtime: holecpts without cpoints Formal 構造點批量孔：沒有構造點', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().cpoints.length, 0)
  await g().runCommand('holecpts', '構造點批量孔')
  assert.match(g().status, /構造點批量孔：沒有構造點 — 用「構造點」工具落點先（每點一孔）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /構造點批量孔：先要有實體|孔需要先有一個實體|批量孔：先要有實體/)
  assert.deepEqual(g().features, before)
})

// ── splitsketch no body (≠ more49 silhouettesplit / more48 splitplane) ──

test('runtime: splitsketch without body Formal 草圖分割需要先有一個活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(!!g().bodyMesh, false)
  await g().runCommand('splitsketch', '草圖分割')
  assert.match(g().status, /草圖分割需要先有一個活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /輪廓分割需要|任意平面切需要|分割面：要先有實體/)
  assert.deepEqual(g().features, before)
})

// ── sweepedge no solid (≠ more34 sweep refuse / more41 sweep end-scale / more52 formsweep) ──

test('runtime: sweepedge without solid Formal 沿實體邊鏈掃掠：先要有一個實體', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  await g().runCommand('sweepedge', '沿實體邊鏈掃掠')
  assert.match(g().status, /沿實體邊鏈掃掠：先要有一個實體（在其稜邊接力做路徑）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /造型掃掠：|掃掠需要|FORM T-spline/)
  assert.equal(g().sweepEdgePick, false)
  assert.deepEqual(g().features, before)
})

// ── formMode blocks solid cmd (≠ more51 formsketch / more52 formextrude / more48 formsubdiv) ──

test('runtime: solid cmd in formMode Formal 請先完成 Form，再切換環境 (commandDisabledReason)', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('createform', '建立造型')
  assert.equal(g().formMode, true)
  // Pharynx: commandDisabledReason fires before formMode switch body
  // (ui.disabled.finishForm) — real UX gate when ribbon SOLID cmds hit in FORM.
  await g().runCommand('extrude', '拉伸')
  assert.match(g().status, /請先完成 Form，再切換環境/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /造型拉伸：FORM T-spline|造型環境內「建立草圖」|細分：請先建立|「拉伸」是實體操作/)
  assert.equal(g().formMode, true)
  assert.deepEqual(g().features, before)
})
