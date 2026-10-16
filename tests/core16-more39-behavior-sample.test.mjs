/**
 * BOT-D more39 / FISHING62+ — CORE16 true behavior / regression gaps on tip f100cd3.
 * Complements smoke-21 + more34–more38 samples without duplicating those topics.
 * more34: box/cyl-cut vol, revolve/sweep refuse, refuse→360, fillet-then-refuse, MATERIALS+F54.
 * more35: MATERIALS+F54, copy, boolean, shell→fillet, split, 2×1 pattern-after-cut, hole csink,
 * move cancel, emboss depth0, undo two-step.
 * more36: MATERIALS, F56 趨勢著色, hide/rebuild, arb through, chamfer two-dist, loft thin-wall,
 * thicken 99999, timeline reorder, pushpull, cyl/cone vol, importStep garbage.
 * more37: MATERIALS, F58 匯入, box/cyl/cone 0, fillet/hole/pattern gate, extrude through-cut ≈πr²h,
 * chamfer dist2=0, thicken 0/99999, timeline-chip legal revolve/wall0.
 * more38: MATERIALS+F60 tip.joint, loft rail, loft <2 sections, emboss AB preview, extrude dist,
 * extrude cut-through discrete, sketch dual-icon, 2×2 body pattern, b3 shell/split.
 * Focus here: revolve cut groove · mirror gate · emboss size0/neg/engrave · cyl/cone timeline label ·
 * sketch constraint DOF · appearance color · dialog header OK · fillet chip legal edit ·
 * MATERIALS+F62 tip.align/tip.joint always-hard.
 * Always-hard: MATERIALS SC keep + FISHING62 Formal tip.align 選面配合 / tip.joint 轉動.
 * Skipped: thicken-zero-oversize (identical to more37 thicken 0/99999).
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
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')
const { featureKindLabel, isCylinderPrimitive, isConePrimitive } = await import(
  '../src/ui/featureLabel.ts',
)
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')

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
const PLATE = {
  id: 'plate',
  type: 'extrude',
  profile: { kind: 'rect', a: [-30, -20], b: [30, 20] },
  height: 10,
  operation: 'new',
}
const GROOVE_PROF = { kind: 'rect', a: [8, -10], b: [28, 10] }

// ── always-hard: MATERIALS + FISHING62 Formal tip.align / tip.joint ──

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('always-hard: FISHING62 Formal tip.align 選面配合 (zh-HK+ribbon); tip.joint 轉動', () => {
  const hk = rd('src/i18n/locales/zh-HK.ts')
  const rb = rd('src/ribbon.ts')
  assert.match(hk, /"tip\.align": "對齊：.*選面配合/)
  assert.match(hk, /一次性快捷，不記錄配合/)
  assert.doesNotMatch(
    hk,
    /"tip\.align": "對齊：先點基準面再點要移動件的面 —— 平面貼平 \/ 圓柱對準同軸。"/,
  )
  assert.match(rb, /id: 'align'[\s\S]{0,200}選面配合/)
  assert.match(hk, /"tip\.joint": "關節：組件之間建立運動關節（轉動\/滑動\/剛性等）。"/)
  assert.doesNotMatch(hk, /tip\.joint.*旋轉\/滑動/)
})

// ── revolve cut groove: cut mode volume ↓ + Formal status ─────────

test('runtime: revolve cut groove volume decreases; Formal 切割（車槽） status', async () => {
  reset()
  assert.equal(await g().applyFeatures([PLATE], 'plate'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, 60 * 40 * 10, 1), `plate vol ${v0}`)

  await g().addRevolve(GROOVE_PROF, 180, 'Y', 'cut', 0)
  assert.match(g().status, /切割（車槽）/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /切割\(车槽\)|已旋转切割/)
  const rev = g().features.find((f) => f.type === 'revolve' && f.op === 'cut')
  assert.ok(rev, `expected cut revolve, feats=${g().features.map((f) => f.type + ':' + (f.op || 'new')).join(',')}`)
  assert.equal(rev.angle, 180)
  const v1 = await volSTEP()
  assert.ok(v1 < v0 - 100, `addRevolve cut volume ${v1} < ${v0}`)

  // Source Formal TC labels (Timeline / store)
  const st = rd('src/store.ts')
  const tl = rd('src/components/Timeline.tsx')
  assert.match(st, /op === 'cut' \? '切割（車槽）'/)
  assert.match(tl, /value: 'cut', label: '切割\(車槽\)'/)
})

// ── mirror gate: missing selection Formal refuse; legal mirror OK ─

test('runtime: mirror gate missing selection Formal refuse; legal body mirror ≈2× vol', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  assert.ok(near(v0, 40 * 30 * 20, 1), `seed ${v0}`)

  g().openFeatDlg('mirror')
  g().setFeatParam('target', 'feature')
  useApp.setState({ selectedFeature: null, selectedFeatures: [] })
  await g().commitFeatDlg()
  assert.match(g().status, /^鏡像特徵：請先在時間軸點選要鏡像的特徵/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已镜像|镜像特征|请先/)
  assert.ok(g().featDlg, 'dialog stays open on refuse')
  assert.deepEqual(g().features, before)
  assert.ok(near(await volSTEP(), v0, 1e-3))

  // Legal body mirror via applyFeatures
  const mir = { id: 'M', type: 'mirror', plane: 'YZ', offset: 0 }
  assert.equal(await g().applyFeatures([BOX, mir], 'mirror body'), true, g().status)
  const v1 = await volSTEP()
  assert.ok(Math.abs(v1 - 2 * v0) / (2 * v0) < 0.02, `mirror volume symmetry: ${v0} → ${v1}`)
  assert.ok(g().features.some((f) => f.type === 'mirror'))
  assert.doesNotMatch(g().status, COLLOQ)
})

// ── emboss empty-depth MORE: size0 / neg depth / engrave (≠ more35 depth0) ──

test('runtime: emboss size0/neg-depth/engrave Formal refuse (beyond more35 depth0)', async () => {
  const SIZE0 = '字高必須大於 0'
  const DEPTH0 = '浮雕深度必須大於 0（凸起／刻入用下方選項切換）'
  const EMPTY = '請輸入浮雕文字'

  assert.equal(
    featDlgBlockingReason({ kind: 'emboss', params: { text: 'AB', depth: 1.5, size: 0 } }),
    SIZE0,
  )
  assert.equal(
    featDlgBlockingReason({ kind: 'emboss', params: { text: 'AB', depth: -1, size: 8 } }),
    DEPTH0,
  )
  assert.equal(
    featDlgBlockingReason({ kind: 'emboss', params: { text: '', depth: 0, size: 0 } }),
    EMPTY,
  )
  assert.equal(
    featDlgBlockingReason({ kind: 'emboss', params: { text: 'X', depth: 1, size: 0 } }),
    SIZE0,
  )

  reset()
  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'AB', depth: 1.5, size: 0, mode: 'emboss' },
      payload: { arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] } },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /字高必須大於 0|未提交：/)
  assert.ok(g().featDlg, 'dialog stays open on size-0 refuse')
  assert.doesNotMatch(g().status, COLLOQ)

  reset()
  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'AB', depth: 0, size: 8, mode: 'engrave' },
      payload: { arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] } },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /浮雕深度必須大於 0|尺寸已拒絕：浮雕字高和深度都必須大於 0/)
  assert.ok(g().featDlg, 'dialog stays open on engrave depth0')
})

// ── cylinder/cone timeline label Formal stays 圓柱／圓錐 (≠ more36 create-vol) ──

test('hard: cylinder/cone timeline label Formal 圓柱／圓錐 after featureKindLabel (edit/timeline)', () => {
  const cyl = {
    type: 'extrude',
    profile: { kind: 'circle', c: [0, 0], r: 17.75 },
    height: 80,
    operation: 'new',
  }
  const cone = { type: 'prim', shape: 'cone', a: 20, b: 0, c: 40, op: 'new' }
  const sketchExtrude = {
    type: 'extrude',
    profile: { kind: 'circle', c: [0, 0], r: 10 },
    height: 20,
    operation: 'new',
    sketchId: 'sk1',
  }

  assert.equal(isCylinderPrimitive(cyl), true)
  assert.equal(isConePrimitive(cone), true)
  assert.equal(isCylinderPrimitive(sketchExtrude), false)
  assert.equal(featureKindLabel(cyl, '拉伸'), '圓柱')
  assert.equal(featureKindLabel(cone, '原語'), '圓錐')
  assert.doesNotMatch(featureKindLabel(cyl, '拉伸'), /拉伸/)
  assert.equal(featureKindLabel(sketchExtrude, '拉伸'), '拉伸')

  const tl = rd('src/components/Timeline.tsx')
  const fl = rd('src/ui/featureLabel.ts')
  const st = rd('src/store.ts')
  assert.match(tl, /featureKindLabel/)
  assert.match(tl, /const kindLabel = featureKindLabel/)
  assert.match(tl, /const titleKind = kindLabel/)
  assert.match(fl, /return '圓柱'/)
  assert.match(fl, /return '圓錐'/)
  assert.doesNotMatch(fl, /return '圆柱'|return '圆锥'|return '拉伸'/)
  assert.match(st, /FISHING27 P3：圓柱／圓錐/)
  assert.match(st, /return featureKindLabel/)
})

// ── sketch constraint DOF Formal markers + one runtime pin ────────

test('hard+runtime: sketch constraint DOF Formal markers + refreshSkDof pin', async () => {
  const vp = rd('src/components/Viewport.tsx')
  const st = rd('src/store.ts')
  assert.match(vp, /data-testid="sketch-dof"/)
  assert.match(vp, /✓ 完全定義 · DOF 0 · 約束 \$\{skCons\.length\}/)
  assert.match(vp, /約束 \$\{skCons\.length\} · DOF \$\{skDof \?\? '…'\}/)
  assert.match(vp, /⚠ 約束衝突/)
  assert.doesNotMatch(vp, /完全定义 · DOF|剩余自由度|约束冲突 ×/)
  assert.match(st, /約束已求解 ✓ 剩餘自由度 DOF \$\{res\.dof\}/)
  assert.match(st, /⚠ 約束衝突\/過約束/)
  assert.doesNotMatch(st, /约束已求解 ✓ 剩余自由度/)

  reset()
  useApp.setState({
    mode: 'sketch',
    sketchPlane: 'XY',
    sketchShape: { type: 'rect', a: [0, 0], b: [20, 10] },
    sketchProfiles: [],
    skCons: [],
  })
  await g().refreshSkDof()
  assert.equal(typeof g().skDof, 'number')
  assert.ok(g().skDof > 0, `expected free DOF, got ${g().skDof}`)
  const under = `約束 ${g().skCons.length} · DOF ${g().skDof ?? '…'}`
  assert.match(under, /約束 \d+ · DOF \d+/)
  assert.doesNotMatch(under, COLLOQ)
})

// ── appearance color Formal TC presence ───────────────────────────

test('runtime: appearance color Formal TC setMaterialPreset; density untouched', () => {
  const st = rd('src/store.ts')
  assert.match(st, /status: `已套用外觀：\$\{name\}`/)
  assert.match(st, /setBodyColor: \(c\) => set\(\{ bodyColor: c, appearanceName: '' \}\)/)
  assert.doesNotMatch(st, /已套用外观：/)

  reset()
  const d0 = g().bodyDensity
  const phys0 = g().physMatName
  assert.ok(MATERIALS['金'], '金 preset exists')
  g().setMaterialPreset('金')
  assert.equal(g().bodyColor, MATERIALS['金'].color)
  assert.equal(g().appearanceName, '金')
  assert.equal(g().status, '已套用外觀：金')
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已套用外观|已应用外观/)
  assert.equal(g().bodyDensity, d0, 'appearance must not touch density')
  assert.equal(g().physMatName, phys0, 'physical material untouched')

  g().setBodyColor('#123456')
  assert.equal(g().bodyColor, '#123456')
  assert.equal(g().appearanceName, '', 'custom colour clears preset swatch')
})

// ── dialog header OK prep Formal ──────────────────────────────────

test('hard: dialog header OK (cmd-palette-ok) shares onOk with footer', () => {
  const dlg = rd('src/components/CommandDialog.tsx')
  assert.match(dlg, /data-testid="command-confirm"/)
  assert.match(dlg, /data-testid="command-cancel"/)
  assert.match(dlg, /className="cmd-palette-ok"/)
  assert.match(dlg, /onClick=\{\(\) => \{ if \(!okDisabled\) onOk\(\) \}\}/)
  assert.match(dlg, /onClick=\{onOk\}/)
})

// ── fillet chip legal edit (≠ more37 fillet R gate refuse) ────────

test('runtime: fillet timeline chip legal R 2→3 applies; volume shrinks (no false gate)', async () => {
  reset()
  const FILLET_R2 = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }
  assert.equal(await g().applyFeatures([BOX, FILLET_R2], 'seed fillet'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(v0 > 1000, `seed vol ${v0}`)
  assert.ok(v0 < 40 * 30 * 20, 'fillet already removed material')

  await g().editFeature('F', { radius: 3 })
  assert.ok(!isIllegalRejectStatus(g().status), g().status)
  assert.doesNotMatch(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.equal(g().features.find((x) => x.id === 'F')?.radius, 3, g().status)
  const v1 = await volSTEP()
  assert.ok(v1 < v0 - 1, `R 2→3 must shrink volume: ${v1} vs ${v0}`)
  assert.doesNotMatch(g().status, COLLOQ)
})
