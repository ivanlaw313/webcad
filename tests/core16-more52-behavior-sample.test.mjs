/**
 * BOT-D more52 / FISHING94+ — CORE16 true behavior / regression gaps on tip 62cd0b35.
 * Complements smoke-21 + more34–more51 samples without duplicating those topics.
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
 * more50: MATERIALS+F88/F91 jaLabels, formweld/formfillhole/formerasefill stubs,
 * removefaces/moveface/offsetsurf-no-solid, extrude/revolve no-sketch, autoorient-no-solid,
 * joint<2, meshfit-no-mesh, groundcomp-no-select, asbuiltjoint-checked≠2.
 * more51: MATERIALS+F88/F93 demold catalog, formloop/formcrease/formedit/formsketch/formrepair/
 * forminsert stubs · createpcb · basefeature-no-solid · arrange<2 · presspull-empty ·
 * scaleasm-no-asm · newcontactset-checked≠2 · motionstudy-no-joint.
 * Focus here: formextrude/formrevolve/formsweep/formloft FORM T-spline stubs ·
 * vollattice/voltexture/volmodify · computeall-empty · computeunresolved · delete-no-sel ·
 * remove-no-comp · jointpick<2 · drivejoints-no-joint.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F94 demold status
 * prefix pins (JA 離型到達性… / EN Demold Accessibility… on result sentences;
 * ≠ more51 F93 catalog exact tStatus for bare 脫模可達性).
 * Hand-off: FISHING97 cherry (more51 → F96; more50 → F95; more49 on F94;
 * do NOT target F94/F95/F96).
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

test('always-hard: FISHING94 demold status prefix pins JA 離型到達性… / EN Demold Accessibility… (≠ more51 F93 catalog exact)', async () => {
  const i18n = rd('src/i18n.ts')
  assert.match(i18n, /FISHING94: status result sentences still start with TC/)
  assert.match(i18n, /s\.includes\('脫模可達性'\) \|\| s\.includes\('脱模可达性'\)/)
  assert.match(i18n, /s\.split\('脫模可達性'\)\.join\(name\)\.split\('脱模可达性'\)\.join\(name\)/)
  const once = i18n.slice(i18n.indexOf('function tStatusOnce'))
  const prefixAt = once.indexOf("s.includes('脫模可達性')")
  const exactAt = once.indexOf('const exact = _STATUS_EXACT[s]')
  assert.ok(prefixAt >= 0 && exactAt > prefixAt, 'F94 prefix replace before EN exact')
  // result sentences (not bare catalog label): prefix rewritten via tool.accessanalysis
  assert.equal(tStatus('脫模可達性：需要活動實體', 'ja'), '離型到達性：需要活動實體')
  assert.equal(tStatus('脫模可達性：需要活動實體', 'en'), 'Demold Accessibility：需要活動實體')
  assert.equal(tStatus('脱模可达性：需要活動實體', 'ja'), '離型到達性：需要活動實體')
  assert.equal(tStatus('脫模可達性：脫模方向不可是零向量', 'ja'), '離型到達性：脫模方向不可是零向量')
  assert.match(tStatus('🔓 脫模可達性', 'ja'), /離型到達性/)
  assert.match(tStatus('🔓 脫模可達性', 'en'), /Demold Accessibility/)
  assert.equal(tStatus('脫模可達性：需要活動實體', 'zh-HK'), '脫模可達性：需要活動實體')
})

// ── formextrude FORM T-spline stub (≠ more51 formsketch / more50 formweld / more48 formsubdiv) ──

test('runtime: formextrude Formal FORM T-spline 曲線/截面求解仍在實現中', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formextrude', '造型拉伸')
  assert.match(g().status, /造型拉伸：FORM T-spline 曲線\/截面求解仍在實現中；不會改用 SOLID 命令冒充/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /造型環境內「建立草圖」|Weld（FORM）|細分：請先建立/)
  assert.deepEqual(g().features, before)
})

// ── formrevolve FORM T-spline stub (≠ more50 revolve-no-sketch / more34 revolve refuse) ──

test('runtime: formrevolve Formal FORM T-spline 曲線/截面求解仍在實現中', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formrevolve', '造型旋轉')
  assert.match(g().status, /造型旋轉：FORM T-spline 曲線\/截面求解仍在實現中；不會改用 SOLID 命令冒充/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /旋轉需要先畫|Insert Edge：|Crease：/)
  assert.deepEqual(g().features, before)
})

// ── formsweep FORM T-spline stub (≠ more34 sweep refuse / more46 surfsweep) ──

test('runtime: formsweep Formal FORM T-spline 曲線/截面求解仍在實現中', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formsweep', '造型掃掠')
  assert.match(g().status, /造型掃掠：FORM T-spline 曲線\/截面求解仍在實現中；不會改用 SOLID 命令冒充/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /曲面掃掠|Bridge（FORM）|掃掠需要/)
  assert.deepEqual(g().features, before)
})

// ── formloft FORM T-spline stub (≠ more45 surfloft / more38 loft <2) ──

test('runtime: formloft Formal FORM T-spline 曲線/截面求解仍在實現中', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formloft', '造型放樣')
  assert.match(g().status, /造型放樣：FORM T-spline 曲線\/截面求解仍在實現中；不會改用 SOLID 命令冒充/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /放樣需要|曲面放樣|造型拉伸：/)
  assert.deepEqual(g().features, before)
})

// ── vollattice stub (≠ more45 automatedmodel / more51 createpcb) ──

test('runtime: vollattice Formal 體積晶格內核仍未接通', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('vollattice', '體積晶格')
  assert.match(g().status, /體積晶格：選單位置已對齊；體積場晶格內核仍未接通/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /體積紋理：|修改體積晶格：|Create PCB/)
  assert.deepEqual(g().features, before)
})

// ── voltexture stub (≠ more44 ruled / more51 createpcb) ──

test('runtime: voltexture Formal 體積紋理內核仍未接通', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('voltexture', '體積紋理')
  assert.match(g().status, /體積紋理：選單位置已對齊；體積場紋理內核仍未接通/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /體積晶格：|修改體積晶格：|自動建模/)
  assert.deepEqual(g().features, before)
})

// ── volmodify no lattice feature (≠ more50 formweld / more51 formrepair) ──

test('runtime: volmodify Formal 修改體積晶格：當前檔案沒有可編輯的體積晶格特徵', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('volmodify', '修改體積晶格')
  assert.match(g().status, /修改體積晶格：當前檔案沒有可編輯的體積晶格特徵/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /體積晶格：選單|體積紋理：選單|修復實體：/)
  assert.deepEqual(g().features, before)
})

// ── computeall empty timeline (≠ more36 hide\/rebuild / more42 reorder) ──

test('runtime: computeall without features Formal 全部計算：當前沒有時間軸特徵', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().features.length, 0)
  await g().runCommand('computeall', '全部計算')
  assert.match(g().status, /全部計算：當前沒有時間軸特徵需要重新計算/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /全部計算完成|計算未解析：/)
  assert.deepEqual(g().features, before)
})

// ── computeunresolved no external (≠ more51 createpcb / more58 import) ──

test('runtime: computeunresolved Formal 計算未解析：當前設計沒有未解析外部組件', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('computeunresolved', '計算未解析')
  assert.match(g().status, /計算未解析：只在設計含未解析外部組件時可用；當前設計沒有未解析外部組件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /全部計算：|Create PCB/)
  assert.deepEqual(g().features, before)
})

// ── delete no selection (≠ more44 delface / more50 removefaces) ──

test('runtime: delete without selection Formal 先選中一個特徵或組件再刪除', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().selectedFeature, null)
  assert.equal(g().selectedComponent, null)
  await g().runCommand('delete', '刪除')
  assert.match(g().status, /先選中一個特徵\(時間軸\)或組件\(瀏覽器\)再刪除/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /刪面：|移除：先在瀏覽器|刪除特徵：/)
  assert.deepEqual(g().features, before)
})

// ── remove no component (≠ more50 groundcomp / delete above) ──

test('runtime: remove without component Formal 移除：先在瀏覽器選擇一個組件實例', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().selectedComponent, null)
  assert.equal(g().components.length, 0)
  await g().runCommand('remove', '移除')
  assert.match(g().status, /移除：先在瀏覽器選擇一個組件實例；此命令不會刪除外部來源檔案/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /先選中一個特徵|固定組件：|刪除特徵：/)
  assert.deepEqual(g().features, before)
})

// ── jointpick <2 (≠ more50 joint / more51 arrange / more51 newcontactset) ──

test('runtime: jointpick with <2 components Formal 關節拾取需要≥2個組件', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  assert.equal(g().jointPickMode, false)
  await g().runCommand('jointpick', '關節拾取')
  assert.match(g().status, /關節拾取需要≥2個組件——先「新建組件」固化多個實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /關節需要≥2個組件——|排列：需要至少|新建接觸集：/)
  assert.equal(g().jointPickMode, false)
  assert.deepEqual(g().features, before)
})

// ── drivejoints no joints (≠ more51 motionstudy / more40 motionlink / more50 joint) ──

test('runtime: drivejoints without joints Formal 驅動關節：裝配內未有任何關節', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().joints.length, 0)
  await g().runCommand('drivejoints', '驅動關節')
  assert.match(g().status, /驅動關節：裝配內未有任何關節/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /運動研究需要|運動連結：需要最少|關節需要≥2|驅動關節：使用關節面板/)
  assert.equal(g().joints.length, 0)
  assert.deepEqual(g().features, before)
})
