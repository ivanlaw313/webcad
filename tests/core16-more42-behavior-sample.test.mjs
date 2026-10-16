/**
 * BOT-D more42 / FISHING81+ — CORE16 true behavior / regression gaps on tip 8fac5be.
 * Complements smoke-21 + more34–more41 samples without duplicating those topics.
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
 * cyl/cone timeline label, sketch DOF, appearance color (setMaterialPreset), dialog OK, fillet chip R 2→3.
 * more40: MATERIALS+F70 控製→控制 + F69 運動連結, draft angle, shell thickness-0 commit, pipe wall≥R,
 * circpattern count, scale factor 0/×2, combine empty, measure distance Formal, undo fillet→chamfer,
 * surfextrude empty.
 * more41: MATERIALS+F77/76/75/74, planComponentMove, pathpattern count 0/1, rect dx=0, shell empty-pick,
 * sweep end-scale, thicken quilt thick 0, measure area／稜長.
 * Focus here: pathpattern empty path · pathpattern count>100 · offsetsurf dist 0 · hole csAngle clamp ·
 * revolve cross-axis diagnose · loft rail no-open-poly · thicken missing target · measure 軸線夾角 ·
 * setPhysicalMaterial · reorder dependency refuse · FEA feaRes setFeaOpt.
 * Always-hard: MATERIALS SC keep + F81 解析度/tip.fea/再設定溫度 + F79 設定力 + F78 轉角+設定力.
 * Hand-off: FISHING83 cherry (F82 tip already shipped when soft-prep finished).
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
const { combineMeasure } = await import('../src/cad/measureCombine.ts')
const { diagnoseRevolve } = await import('../src/cad/revolveDiagnose.ts')
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

// ── always-hard: MATERIALS + F81 / F79 / F78 ──

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
  assert.ok(MATERIALS['钢'], 'SC key 钢 must exist on MATERIALS')
})

test('always-hard: FISHING81 Formal 解析度 not 分辨率 + tip.fea punctuation + 再設定溫度', () => {
  const vp = rd('src/components/Viewport.tsx')
  const st = rd('src/store.ts')
  const i18n = rd('src/i18n.ts')
  const rb = rd('src/ribbon.ts')
  assert.match(vp, />解析度<\/span>/)
  assert.doesNotMatch(vp, />分辨率<\/span>/)
  assert.match(vp, /降解析度再用/)
  assert.match(vp, /3 檔體素解析度\(20\/28\/40\)/)
  assert.match(st, /已選受力面 — 設定力\/方向\/材料\/解析度/)
  assert.doesNotMatch(st, /已選受力面 — 設定力\/方向\/材料\/分辨率/)
  assert.match(i18n, /已選受力面 — 設定力\/方向\/材料\/解析度/)
  assert.match(st, /收斂研究：跑 3 檔解析度/)
  assert.match(st, /再設定溫度，按面板「熱分析/)
  assert.doesNotMatch(st, /再設溫度，按面板「熱分析/)
  assert.match(rb, /出應力雲圖。紅色 = 最受力/)
  assert.doesNotMatch(rb, /出應力雲圖,紅色/)
})

test('always-hard: FISHING79 Formal 設定力 not 設力 (store/ribbon/ai/i18n)', () => {
  const st = rd('src/store.ts')
  const rb = rd('src/ribbon.ts')
  const ai = rd('src/ai/tools.ts')
  const i18n = rd('src/i18n.ts')
  assert.match(st, /生成式設計：點①固定面（保留區）\+ ②受力面 \+ 設定力/)
  assert.match(st, /生成式設計：先點固定面（保留區）\+ 受力面 \+ 設定力（同受力雲圖一樣）/)
  assert.match(st, /並設定力 ——/)
  assert.doesNotMatch(st, /并設力/)
  assert.doesNotMatch(st, /受力面 \+ 設力/)
  assert.doesNotMatch(st, /— 設力\//)
  assert.match(rb, /點受力面 → 設定力 → 出應力雲圖/)
  assert.match(ai, /並設定力（與受力雲圖一樣）/)
  assert.match(i18n, /受力面 \+ 設定力（同受力雲圖一樣）/)
})

test('always-hard: FISHING78 joint-origin 轉角 + FEA 設定力 kept', () => {
  const jp = rd('src/components/JointsPanel.tsx')
  const vp = rd('src/components/Viewport.tsx')
  const rb = rd('src/ribbon.ts')
  assert.match(jp, /title="繞原點 Z 軸轉角"/)
  assert.match(jp, /label="轉角（°）"/)
  assert.match(jp, /title="關節原點繞 Z 軸轉角（°）"/)
  assert.doesNotMatch(jp, /繞原點 Z 軸旋轉角度/)
  assert.match(vp, /先點①固定面 \+ ②預載面 \+ 設定力/)
  assert.match(vp, /先點①固定面 \+ ②受力面 \+ 設定力/)
  assert.doesNotMatch(vp, /\+ 設力'/)
  assert.match(rb, /id: 'revolve', label: '旋轉'/)
})

// ── pathpattern empty path (≠ more41 count 0/1) ──

test('runtime: pathpattern empty/short path Formal refuse; no pathpattern feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  useApp.setState({
    featDlg: {
      kind: 'pathpattern',
      params: { count: 4, target: 'body', orient: 'identical' },
      payload: { path: [[0, 0]] },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /路徑陣列：沒有有效路徑/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /路径阵列|没有有效路径/)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.some((f) => f.type === 'pathpattern'), false)
  assert.ok(near(await volSTEP(), v0, 1e-3))

  useApp.setState({
    featDlg: {
      kind: 'pathpattern',
      params: { count: 4, target: 'body', orient: 'identical' },
      payload: { path: [] },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /路徑陣列：沒有有效路徑/)
  assert.deepEqual(g().features, before)
})

// ── pathpattern count >100 (≠ more41 count 0/1 / more40 circ) ──

test('runtime: pathpattern count >100 Formal refuse; dialog stays; volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  useApp.setState({
    featDlg: {
      kind: 'pathpattern',
      params: { count: 101, target: 'body', orient: 'identical' },
      payload: { path: [[0, 0], [40, 0], [40, 30]] },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /路徑陣列：數量上限 100/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg, 'dialog stays open on refuse')
  assert.deepEqual(g().features, before)
  assert.equal(g().features.some((f) => f.type === 'pathpattern'), false)
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── offsetsurf dist 0 (≠ more41 thicken quilt 0 / more36 face thicken) ──

test('runtime: offsetSurfFaceAt dist 0 Formal refuse; no offsetsurf feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await volSTEP()
  useApp.setState({
    offsetSurfMode: true,
    appPrompt: async () => '0',
  })
  await g().offsetSurfFaceAt([20, 10, 15])
  assert.match(g().status, /偏移距離要是非零數字/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /偏移距离要是非零数字/)
  assert.equal(g().offsetSurfMode, false, 'mode cleared after refuse')
  assert.equal(g().features.some((f) => f.type === 'offsetsurf'), false)
  assert.deepEqual(g().features, before)
  assert.ok(near(await volSTEP(), v0, 1e-3))
})

// ── hole countersink angle clamp (≠ more35 csink through @90) ──

test('runtime: setHoleCsAngle clamps OOR to 10..170; legal 82/90/120 kept', () => {
  reset()
  assert.equal(g().holeCsAngle, 90)
  g().setHoleCsAngle(82)
  assert.equal(g().holeCsAngle, 82)
  g().setHoleCsAngle(120)
  assert.equal(g().holeCsAngle, 120)
  g().setHoleCsAngle(5)
  assert.equal(g().holeCsAngle, 10, 'below 10 clamps to 10')
  g().setHoleCsAngle(200)
  assert.equal(g().holeCsAngle, 170, 'above 170 clamps to 170')
  g().setHoleCsAngle(NaN)
  assert.equal(g().holeCsAngle, 90, 'NaN falls back to 90')
  g().setHoleCsAngle(100)
  assert.equal(g().holeCsAngle, 100)
})

// ── revolve cross-axis diagnose Formal (≠ more34 revolve Ø=0 / refuse→360) ──

test('hard: diagnoseRevolve cross-axis Formal 跨過了旋轉軸; on-axis 貼住', () => {
  const src = { plane: 'XY', baseZ: 0 }
  const Y = [0, 1, 0]
  const cross = diagnoseRevolve({
    profile: { kind: 'poly', pts: [[-10, 0], [10, 0], [10, 20], [-10, 20]] },
    source: src,
    axisDir: Y,
  })
  assert.match(cross.join('|'), /跨過了旋轉軸/)
  assert.doesNotMatch(cross.join('|'), /跨过了旋转轴/)
  assert.doesNotMatch(cross.join('|'), COLLOQ)

  const onAxis = diagnoseRevolve({
    profile: { kind: 'poly', pts: [[0, 0], [0, 10], [0, 20]] },
    source: src,
    axisDir: Y,
  })
  assert.match(onAxis.join('|'), /貼住旋轉軸/)
  assert.doesNotMatch(onAxis.join('|'), /贴住旋转轴/)
})

// ── loft guide: no open poly Formal (≠ more38 loft rail success / <2 sections) ──

test('runtime: setLoftRailFromSketch without open poly Formal refuse; loftRail stays null', () => {
  reset()
  useApp.setState({
    loftSections: [
      { profile: { kind: 'circle', c: [0, 0], r: 10 }, z: 0 },
      { profile: { kind: 'circle', c: [0, 0], r: 8 }, z: 30 },
    ],
    loftRail: null,
    sketchSources: {
      sk1: {
        shapes: [{ type: 'circle', c: [0, 0], r: 5 }],
        cons: [],
        plane: 'XY',
        baseZ: 0,
      },
    },
  })
  g().setLoftRailFromSketch('sk1')
  assert.match(g().status, /放樣導軌：此草圖沒有開放折線/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /放样导轨|开放折线/)
  assert.equal(g().loftRail, null)

  g().setLoftRailFromSketch('missing')
  assert.match(g().status, /草圖源已不存在/)
  assert.equal(g().loftRail, null)
})

// ── thicken quilt missing target (≠ more41 thick 0) ──

test('runtime: thickenParkedAt missing target Formal refuse; no thickenquilt', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({
    quiltPickMode: true,
    bodyMesh: { ...(g().bodyMesh || {}), parked: [] },
    appPrompt: async () => '2',
  })
  await g().thickenParkedAt(0)
  assert.match(g().status, /加厚曲面：目標曲面已不存在，請重新選擇/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /目标曲面已不存在/)
  assert.equal(g().quiltPickMode, false)
  assert.equal(g().features.some((f) => f.type === 'thickenquilt'), false)
  assert.deepEqual(g().features, before)
})

// ── measure 軸線夾角 Formal (≠ more40 最短距離 with md / plane 夾角) ──

test('hard: measure Formal 軸線夾角 for non-parallel cylinders without faceMinDist', () => {
  const ang = combineMeasure([
    { kind: 'face', surfType: 'CYLINDRE', axisO: [0, 0, 0], axisD: [0, 0, 1], radius: 4 },
    { kind: 'face', surfType: 'CYLINDRE', axisO: [10, 0, 0], axisD: [1, 0, 0], radius: 4 },
  ])
  assert.equal(ang.type, 'angle')
  assert.equal(ang.label, '軸線夾角')
  assert.ok(near(ang.value, 90, 1e-3))
  assert.doesNotMatch(ang.label, /轴线夹角|夹角/)
  assert.doesNotMatch(ang.label, COLLOQ)
  assert.ok(near(ang.supplement, 90, 1e-3))
})

// ── appearance material assign via setPhysicalMaterial (≠ more39 setMaterialPreset color-only) ──

test('runtime: setPhysicalMaterial assigns TC Formal status + density; bodyDensity file default kept', () => {
  reset()
  const d0 = g().bodyDensity
  assert.ok(MATERIALS['铝']?.density)
  g().setPhysicalMaterial('铝')
  assert.equal(g().physMatName, '铝')
  assert.equal(g().appearanceName, '铝')
  assert.equal(g().bodyColor, MATERIALS['铝'].color)
  assert.equal(g().bodyDensity, d0, 'file default bodyDensity must stay')
  assert.match(g().status, /已設活動實體材質「鋁」密度/)
  assert.match(g().status, /檔案預設密度/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /已设活动实体材质|文件默认密度/)

  g().setPhysicalMaterial('铝')
  assert.match(g().status, /活動實體已是「鋁」/)
})

// ── timeline reorder dependency refuse (≠ more36 successful reorder) ──

test('runtime: reorderFeature before dependency Formal refuse; order unchanged', async () => {
  reset()
  const box = { id: 'prim1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }
  assert.equal(await g().applyFeatures([box], 'box'), true, g().status)
  const f1 = { id: 'fil1', type: 'fillet', radius: 3, nears: [[40, 0, 40]] }
  assert.equal(await g().applyFeatures([...g().features, f1], 'f1'), true, g().status)
  const before = g().features.map((f) => f.id)
  assert.deepEqual(before, ['prim1', 'fil1'])
  const ok = await g().reorderFeature('fil1', 0)
  assert.equal(ok, false)
  assert.match(g().status, /不能移動：/)
  assert.match(g().status, /必須排在它之後|依賴|引用的邊線/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /不能移动/)
  assert.deepEqual(
    g().features.map((f) => f.id),
    before,
  )
})

// ── FEA feaRes setFeaOpt behavior (≠ Formal chrome-only; resolution write) ──

test('runtime: setFeaOpt feaRes writes 20/28/40; clearFea Formal 已清除受力雲圖', () => {
  reset()
  g().setFeaOpt({ feaRes: 20 })
  assert.equal(g().feaRes, 20)
  g().setFeaOpt({ feaRes: 40 })
  assert.equal(g().feaRes, 40)
  g().setFeaOpt({ feaRes: 28 })
  assert.equal(g().feaRes, 28)
  useApp.setState({ feaMode: 1, feaFixed: { point: [0, 0, 0], normal: [0, 0, 1] } })
  g().clearFea()
  assert.equal(g().feaMode, 0)
  assert.equal(g().feaFixed, null)
  assert.match(g().status, /已清除受力雲圖/)
  assert.doesNotMatch(g().status, /已清除受力云图/)
  assert.doesNotMatch(g().status, COLLOQ)
})
