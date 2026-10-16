/**
 * BOT-D more51 / FISHING93+ — CORE16 true behavior / regression gaps on tip 5d735867.
 * Complements smoke-21 + more34–more50 samples without duplicating those topics.
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
 * Focus here: formloop/formcrease/formedit/formsketch/formrepair/forminsert stubs · createpcb ·
 * basefeature-no-solid · arrange<2 · presspull-empty · scaleasm-no-asm · newcontactset-checked≠2 ·
 * motionstudy-no-joint.
 * Always-hard: MATERIALS SC keep + F88 lazySafe／无法开模／無法開模 + F93 demold pins
 * (JA tStatus 離型到達性 / EN Demold Accessibility; ≠ more50 F91 jaLabels Formal trio).
 * Hand-off: FISHING96 cherry (more50 → F95; more49 → F94; more48 on F93; do NOT target F93/F94/F95).
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

// ── always-hard: MATERIALS + F88 / F93 demold ──

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

test('always-hard: FISHING93 demold pins JA tStatus 離型到達性 / EN Demold Accessibility (≠ more50 F91 jaLabels)', async () => {
  const i18n = rd('src/i18n.ts')
  const en = rd('src/i18n/locales/en.ts')
  assert.match(i18n, /FISHING93: BrowserTree analysis row/)
  assert.match(i18n, /const catalogKey = LABEL_TO_KEY\[s\]/)
  assert.match(i18n, /if \(catalogKey\) return msg\(catalogKey, L\)/)
  const once = i18n.slice(i18n.indexOf('function tStatusOnce'))
  const catAt = once.indexOf('const catalogKey = LABEL_TO_KEY[s]')
  const exactAt = once.indexOf('const exact = _STATUS_EXACT[s]')
  assert.ok(catAt >= 0 && exactAt > catAt, 'F93 catalog before EN exact')
  assert.match(en, /"alias\.accessanalysis":\s*"Demold Accessibility\b/)
  assert.match(en, /"cmd\.accessanalysis":\s*"Demold Accessibility"/)
  assert.match(en, /"tool\.accessanalysis":\s*"Demold Accessibility"/)
  // runtime: BrowserTree label through tStatus — JA catalog, not EN Demold shred
  assert.equal(tStatus('脫模可達性', 'ja'), '離型到達性')
  assert.equal(tStatus('脫模可達性', 'en'), 'Demold Accessibility')
  assert.equal(tStatus('脱模可达性', 'ja'), '離型到達性')
  assert.equal(tStatus('脫模可達性', 'zh-HK'), '脫模可達性')
  assert.equal(tStatus('脫模可達性', 'zh-CN'), '脱模可达性')
})

// ── formloop no face (≠ more50 formweld / more49 formbridge / more48 formsubdiv) ──

test('runtime: formloop without selFace Formal Insert Edge：先點選一個控制籠面; no formCage', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().formCage, null)
  await g().runCommand('formloop', '插入邊')
  assert.match(g().status, /Insert Edge：先點選一個控制籠面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Crease：|編輯造型：|Weld（FORM）|細分：請先建立/)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

// ── formcrease no face (≠ more50 formerasefill / more47 formmirror) ──

test('runtime: formcrease without selFace Formal Crease：先點選一個控制籠面', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formcrease', '摺痕')
  assert.match(g().status, /Crease：先點選一個控制籠面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Insert Edge：|Bridge（FORM）|鏡像：請先建立/)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

// ── formedit no cage (≠ more48 formsubdiv / more47 formmirror) ──

test('runtime: formedit without formCage Formal 編輯造型：請先建立基本體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formedit', '編輯造型')
  assert.match(g().status, /編輯造型：請先在「建立 ▾」建立一個造型基本體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /細分：請先建立|Insert Edge：|Crease：/)
  assert.equal(g().formCage, null)
  assert.deepEqual(g().features, before)
})

// ── formsketch stub (≠ more50 formfillhole / more49 formbridge) ──

test('runtime: formsketch Formal 造型環境內建立草圖尚未接到 T-spline', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formsketch', '造型草圖')
  assert.match(g().status, /造型環境內「建立草圖」尚未接到 T-spline 面/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Fill Hole（FORM）|Weld（FORM）|Insert Mesh（FORM）/)
  assert.equal(g().mode, 'model')
  assert.deepEqual(g().features, before)
})

// ── formrepair stub (≠ more50 formweld / more48 formsubdiv) ──

test('runtime: formrepair Formal 修復實體拓撲檢查仍在實現中', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('formrepair', '修復實體')
  assert.match(g().status, /修復實體：目前控制籠會在「完成造型」時做拓撲檢查/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /Insert Mesh（FORM）|Create PCB|Weld（FORM）/)
  assert.deepEqual(g().features, before)
})

// ── forminsert stub (≠ more50 meshfit / more36 importStep) ──

test('runtime: forminsert Formal Insert Mesh（FORM）仍在實現中', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('forminsert', '插入網格')
  assert.match(g().status, /Insert Mesh（FORM）：網格轉 T-spline 仍在實現中/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /MeshFit \/ 轉 B-rep|修復實體：|Create PCB/)
  assert.deepEqual(g().features, before)
})

// ── createpcb stub (≠ more45 automatedmodel / more46 boundaryfill) ──

test('runtime: createpcb Formal Create PCB 仍在實現中', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('createpcb', '建立 PCB')
  assert.match(g().status, /Create PCB：主選單位置已對齊；ECAD\/PCB 工作流仍在實現中/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /自動建模|邊界填充|Create Base Feature/)
  assert.deepEqual(g().features, before)
})

// ── basefeature no-solid (≠ more47 access-no-solid / more50 autoorient) ──

test('runtime: basefeature without solid Formal Create Base Feature 需要先有活動實體', async () => {
  reset()
  const before = structuredClone(g().features)
  await g().runCommand('basefeature', '建立基礎特徵')
  assert.match(g().status, /Create Base Feature 需要先有一個活動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已取消 Create Base Feature|Create PCB|自動擺正需要/)
  assert.deepEqual(g().features, before)
})

// ── arrange <2 visible (≠ more50 joint<2 / more41 planComponentMove) ──

test('runtime: arrange with <2 visible components Formal 排列：需要至少 2 個可見組件', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  await g().runCommand('arrange', '排列')
  assert.match(g().status, /排列：需要至少 2 個可見組件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /關節需要≥2|剛性組：|新建接觸集/)
  assert.deepEqual(g().features, before)
})

// ── presspull empty (≠ more46 pushpull-edit / more50 extrude-no-sketch) ──

test('runtime: presspull without sketch\/solid Formal 按拉：先畫草圖輪廓', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().pushPullMode, false)
  await g().runCommand('presspull', '按拉')
  assert.match(g().status, /按拉：先畫草圖輪廓再拉伸，或在已有實體的平面上推\/拉/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /拉伸需要先畫|按拉：已帶入|请输入非零/)
  assert.equal(g().pushPullMode, false)
  assert.equal(g().featDlg, null)
  assert.deepEqual(g().features, before)
})

// ── scaleasm no components (≠ more47 scale-no-solid / more44 scale-aniso) ──

test('runtime: scaleasm without assembly Formal 整體縮放需要裝配', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().components.length, 0)
  await g().runCommand('scaleasm', '整體縮放')
  assert.match(g().status, /整體縮放需要裝配（多個組件）；單體請用「縮放」特徵/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /縮放：|請輸入正數比例|MeshFit/)
  assert.deepEqual(g().features, before)
})

// ── newcontactset checked≠2 (≠ more50 asbuiltjoint / more40 motionlink) ──

test('runtime: newcontactset without exactly 2 checked Formal 新建接觸集 refuse', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().checkedComps.length, 0)
  await g().runCommand('newcontactset', '新建接觸集')
  assert.match(g().status, /新建接觸集：先在瀏覽器勾選剛好 2 個組件/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /按現狀關節|關節需要≥2|剛性組：/)
  assert.deepEqual(g().features, before)
})

// ── motionstudy no joint (≠ more40 F69 motionlink / more50 joint<2) ──

test('runtime: motionstudy without revolute\/slider Formal 運動研究需要單自由度關節', async () => {
  reset()
  const before = structuredClone(g().features)
  assert.equal(g().joints.length, 0)
  await g().runCommand('motionstudy', '運動研究')
  assert.match(g().status, /運動研究需要一個轉動或滑動單自由度關節/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /運動連結：需要最少|關節需要≥2|驅動關節：/)
  assert.equal(g().joints.length, 0)
  assert.deepEqual(g().features, before)
})
