/**
 * BOT-D more38 / FISHING60+ — CORE16 true behavior / regression gaps on tip 5a8c0fa.
 * Complements smoke-21 + more34 + more35 + more36 + more37 samples without duplicating those topics.
 * more34: box/cyl-cut vol, revolve/sweep refuse, refuse→360, fillet-then-refuse, MATERIALS+F54.
 * more35: MATERIALS+F54, copy, boolean, shell→fillet, split, 2×1 pattern-after-cut, hole csink,
 * move cancel, emboss depth0, undo two-step.
 * more36: MATERIALS, F56 趨勢著色, hide/rebuild, arb through, chamfer two-dist, loft thin-wall,
 * thicken 99999, timeline reorder, pushpull, cyl/cone vol, importStep garbage.
 * more37: MATERIALS, F58 匯入, box/cyl/cone 0, fillet/hole/pattern gate, extrude through-cut ≈πr²h,
 * chamfer dist2=0, thicken 0/99999, timeline-chip legal revolve/wall0.
 * Focus here: loft rail · loft <2 sections · emboss AB preview mesh · extrude dist gate ·
 * extrude cut-through discrete sketch path · sketch dual-icon · 2×2 body pattern after cut ·
 * b3 shell/split refuse · MATERIALS+F60 tip.joint always-hard.
 * Always-hard: MATERIALS SC keep + FISHING60 Formal tip.joint 轉動 / 面貼合.
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

const { useApp, FEAT_DLG_DRY_PREVIEW_KINDS, shellFailReason, splitPlaneMissReason } = await import(
  '../src/store.ts',
)
const { importSTEP, measureVolume } = await import('replicad')
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')
const { LOFT_MSG } = await import('../src/cad/loftBuild.ts')

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

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }

function bankLoft(plane, z, shape) {
  g().sketchOnDatumPlane(plane, z)
  useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] })
  g().addLoftSection()
}

async function loftPreview() {
  g().scheduleLoftPreview()
  for (let i = 0; i < 1000 && (g().loftPreviewBusy || !g().loftPreview); i++) {
    await new Promise((r) => setTimeout(r, 30))
  }
  return g().loftPreview
}

// ── always-hard: MATERIALS + FISHING60 Formal tip.joint / 面貼合 ──

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('always-hard: FISHING60 Formal tip.joint 轉動 not 旋轉; 面貼合 status / ASSEMBLE', () => {
  const hk = rd('src/i18n/locales/zh-HK.ts')
  const st = rd('src/store.ts')
  assert.match(hk, /"tip\.joint": "關節：組件之間建立運動關節（轉動\/滑動\/剛性等）。"/)
  assert.doesNotMatch(hk, /tip\.joint.*旋轉\/滑動/)
  assert.match(st, /'面貼合：先點【基準件】一個面/)
  assert.doesNotMatch(st, /'選面配合：先點【基準件】一個面/)
  assert.match(st, /同軸 → 轉動／滑動關節/)
  assert.doesNotMatch(st, /同軸 → 旋轉／滑動關節/)
})

// ── loft rail: Formal refuse cleanly + legal rail commit ─────────

test('runtime: loft rail bankLoftRail Formal refuse; legal rail loft commits with volume', async () => {
  reset()
  g().bankLoftRail()
  assert.match(g().status, /放樣導軌：先用「折線」/)
  assert.doesNotMatch(g().status, COLLOQ)

  g().sketchOnDatumPlane('XZ', 0)
  useApp.setState({
    sketchShape: { type: 'poly', open: true, pts: [[0, 0], [10, 0]] },
    sketchProfiles: [],
    skCons: [],
  })
  g().bankLoftRail()
  assert.match(g().status, /導軌要在 XY/)
  assert.doesNotMatch(g().status, COLLOQ)

  reset()
  bankLoft('XY', 0, { type: 'circle', c: [0, 0], r: 12 })
  bankLoft('XY', 40, { type: 'circle', c: [0, 0], r: 10 })
  useApp.setState({
    sketchSources: {
      ...g().sketchSources,
      skRail: {
        name: '導軌',
        plane: 'XY',
        baseZ: 0,
        shapes: [{ type: 'poly', open: true, pts: [[12, 0], [30, 0]] }],
        cons: [],
      },
    },
  })
  g().setLoftRailFromSketch('skRail')
  assert.equal(g().loftRail?.length, 2, g().status)
  g().openLoftDlg()
  const pv = await loftPreview()
  assert.ok(pv?.mesh && !pv.error, pv?.error)
  await g().commitLoft()
  const loft = g().features.find((f) => f.type === 'loft')
  assert.ok(loft, g().status)
  assert.ok(loft.rails?.[0]?.length === 2, `committed rails: ${JSON.stringify(loft.rails)}`)
  assert.match(g().status, /導軌|已放樣|放樣/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok((await volSTEP()) > 3000)
})

// ── loft thin sections: <2 refuse + legal 2-section (not more36 thin-wall) ──

test('runtime: loft <2 sections Formal refuse; legal 2-section commits without fallback', async () => {
  reset()
  assert.equal(g().loftSections.length, 0)
  g().openLoftDlg()
  assert.equal(g().loftDlgOpen, false)
  assert.match(g().status, /放樣需要≥2個截面|≥2/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(LOFT_MSG.tooFew, '放樣失敗：至少要 2 個截面（或 1 個截面加封口點）')

  bankLoft('XY', 0, { type: 'circle', c: [0, 0], r: 12 })
  assert.equal(g().loftSections.length, 1)
  g().openLoftDlg()
  assert.equal(g().loftDlgOpen, false, g().status)
  assert.match(g().status, /放樣需要≥2個截面|≥2/)
  await g().commitLoft()
  assert.match(g().status, /放樣至少需要 2 個截面|至少需要 2/)
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 0)

  reset()
  bankLoft('XY', 0, { type: 'circle', c: [0, 0], r: 12 })
  bankLoft('XY', 40, { type: 'circle', c: [0, 0], r: 10 })
  g().openLoftDlg()
  g().setLoftOpt({ loftWall: 0 })
  const pv = await loftPreview()
  assert.ok(pv?.mesh && !pv.error, pv?.error)
  assert.ok(!pv.warnings.some((x) => /失敗|退回/.test(x)), pv.warnings.join(';'))
  await g().commitLoft()
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 1, g().status)
  assert.ok((await volSTEP()) > 5000)
})

// ── emboss AB preview mesh (not depth0 refuse — more35) ─────────

test('runtime: emboss AB preview mesh produces mesh without crash', async () => {
  const BOX_EMB = {
    id: 'b',
    type: 'extrude',
    profile: { kind: 'rect', a: [-20, -15], b: [20, 15] },
    height: 10,
    operation: 'new',
  }
  const ARB = { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] }
  const AB_TEXT = {
    id: 't',
    type: 'text',
    text: 'AB',
    size: 8,
    height: 1.5,
    op: 'new',
    arbPlane: ARB,
  }

  assert.ok(FEAT_DLG_DRY_PREVIEW_KINDS.has('emboss'), 'emboss dry-run preview kind flag')
  assert.equal(
    featDlgBlockingReason({
      kind: 'emboss',
      params: { text: 'AB', depth: 1.5, size: 8, mode: 'emboss' },
    }),
    null,
  )

  const pv = await w.previewRound([BOX_EMB, AB_TEXT])
  assert.ok(pv, 'previewRound returned mesh')
  assert.ok(pv.triangles?.length > 0, `preview mesh triangles ${pv.triangles?.length}`)
  assert.ok(pv.vertices?.length > 0, 'preview mesh vertices')
  assert.ok(pv.volumeExact > 0, `preview volumeExact ${pv.volumeExact}`)
  const base = await w.previewRound([BOX_EMB])
  assert.ok(
    pv.volumeExact > (base?.volumeExact ?? 0) + 0.2,
    `AB emboss adds volume: base=${base?.volumeExact} pv=${pv.volumeExact}`,
  )

  reset()
  assert.equal(await g().applyFeatures([BOX_EMB], 'seed'), true, g().status)
  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'AB', depth: 1.5, size: 8, mode: 'emboss' },
      payload: { arbPlane: ARB },
    },
    editPreviewMesh: null,
  })
  const mesh = await g().previewFeatDlg()
  assert.ok(mesh, 'previewFeatDlg returns mesh for legal AB')
  assert.ok(mesh.triangles?.length > 0, 'preview mesh has triangles')
  assert.ok(g().editPreviewMesh?.triangles?.length > 0, 'editPreviewMesh set')
})

// ── extrude distance gate ────────────────────────────────────────

test('runtime: extrude dist 0 Formal refuse; legal distance increases volume', async () => {
  reset()
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'rect', a: [-10, -10], b: [10, 10] },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
    extrudeExtent: 'distance',
    extrudeHeight: 0,
    extrudeDlgOpen: true,
  })
  const before = { features: structuredClone(g().features), undo: g().undoStack.length }
  await g().extrudeSketch()
  assert.match(g().status, /請輸入非零拉伸距離|距離不可為 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().mode, 'sketch', 'stay in sketch after refuse')
  assert.deepEqual(g().features, before.features)
  assert.equal(g().undoStack.length, before.undo)
  assert.equal(g().features.some((f) => f.type === 'extrude'), false)

  reset()
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'rect', a: [-10, -10], b: [10, 10] },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
    extrudeExtent: 'distance',
    extrudeHeight: 15,
    extrudeDlgOpen: true,
  })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  assert.ok(g().features.some((f) => f.type === 'extrude'), g().status)
  const v = await volSTEP()
  assert.ok(near(v, 20 * 20 * 15, 2), `legal extrude vol ${v}`)
})

// ── extrude cut-through discrete sketch path (≠ more37 applyFeatures) ──

test('runtime: extrude cut-through discrete sketch path drills plate (not warn-only)', async () => {
  reset()
  const plate = {
    id: 'plate',
    type: 'extrude',
    profile: { kind: 'rect', a: [-25, -20], b: [25, 20] },
    height: 10,
    operation: 'new',
  } // 50×40×10 = 20000
  const holeArea = Math.PI * 64
  assert.equal(await g().applyFeatures([plate], 'plate'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, 20000, 1), `seed ${v0}`)

  g().sketchOnDatumPlane('XY', 10)
  assert.equal(g().mode, 'sketch', g().status)
  useApp.setState({
    sketchShape: null,
    sketchProfiles: [{ type: 'circle', c: [0, 0], r: 8 }],
    skCons: [],
    sketchOp: 'cut',
    extrudeExtent: 'through',
    faceCutThrough: true,
    extrudeHeight: 8,
  })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  assert.doesNotMatch(g().status, /切割沒有|切割没有|体积没有变化|體積沒有變化/)
  assert.match(g().status, /已切割|貫通|布尔减|布爾減/)
  const cut = g().features.find((f) => f.type === 'extrude' && f.operation === 'cut')
  assert.ok(cut, 'cut feature on timeline')
  assert.equal(cut.through, true, 'through flag persisted')
  const v1 = await volSTEP()
  assert.ok(v1 < v0 - holeArea * 8, `cut must remove material: ${v1} vs ${v0}`)
  assert.ok(near(v1, 20000 - holeArea * 10, 5), `through hole ≈ ${v1}`)
})

// ── sketch dual-icon hard Formal presence + one runtime pin ──────

test('hard+runtime: sketch dual-icon Formal presence + DUAL_SKETCH_ICON_KEYS pin', () => {
  const ribbonCmp = rd('src/components/Ribbon.tsx')
  const ribbon = rd('src/ribbon.ts')
  const icons = rd('src/icons.tsx')
  const css = rd('src/index.css')

  const m = ribbonCmp.match(/DUAL_SKETCH_ICON_KEYS\s*=\s*new Set\(\[([^\]]+)\]\)/)
  assert.ok(m, 'DUAL_SKETCH_ICON_KEYS Set must exist')
  const keys = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.deepEqual(keys, ['line', 'rect', 'circle', 'arc', 'offset'])

  const dual = [
    { id: 'sk_polyline', icon: 'line', glyph: '╱' },
    { id: 'sk_rect', icon: 'rect', glyph: '▭' },
    { id: 'sk_circle', icon: 'circle', glyph: '◯' },
  ]
  const defined = new Set([...icons.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)].map((x) => x[1]))
  for (const { id, icon, glyph } of dual) {
    const escaped = glyph.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(
      `id:\\s*'${id}'[\\s\\S]{0,220}?icon:\\s*'${icon}'[\\s\\S]{0,80}?glyph:\\s*'${escaped}'`,
    )
    assert.match(ribbon, re, `${id} must keep icon=${icon} glyph=${glyph}`)
    assert.ok(defined.has(icon), `paths must define icon key '${icon}'`)
  }

  assert.match(ribbonCmp, /dualSketchIcon\s*=\s*!!\(t\.glyph\s*&&\s*DUAL_SKETCH_ICON_KEYS\.has\(t\.icon\)\)/)
  assert.match(ribbonCmp, /import\s*\{\s*ToolIcon\s*\}\s*from\s*['"]\.\.\/icons['"]/)
  assert.match(css, /\.tool-btn\.sk\.sk-dual\s*\{/)
  assert.match(css, /\.sk-icon-row/)
})

// ── rect body 2×2 pattern after cut (≠ more35 2×1) ───────────────

test('runtime: 2×2 rect body pattern after cut multiplies volume (no silent no-op)', async () => {
  reset()
  const box = {
    id: 'box',
    type: 'prim',
    shape: 'box',
    a: 60,
    b: 40,
    c: 20,
    cornerOrigin: true,
    op: 'new',
  }
  const cut = {
    id: 'cut',
    type: 'extrude',
    profile: { kind: 'rect', a: [10, 5], b: [30, 20] },
    height: 20,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([box, cut], 'seed'), true, g().status)
  const seed = await volSTEP()
  const solid = 60 * 40 * 20
  const cutVol = 20 * 15 * 20
  assert.ok(near(seed, solid - cutVol, 1), `seed ${seed} want ${solid - cutVol}`)

  const pat = {
    id: 'pat',
    type: 'pattern',
    countX: 2,
    countY: 2,
    countZ: 1,
    dx: 80,
    dy: 70,
    dz: 0,
    objectType: 'bodies',
  }
  assert.equal(await g().applyFeatures([box, cut, pat], '2x2 body'), true, g().status)
  const after = await volSTEP()
  const expected = seed * 4
  assert.ok(
    near(after, expected, 1),
    `body pattern after cut must change volume: got ${after}, want ${expected} (seed ${seed})`,
  )
  assert.ok(after > seed + 1000, 'volume must increase vs seed')
})

// ── b3 solid cmds: shell/split high-value refuse pins ────────────

test('runtime: b3 shell oversize + split plane-miss Formal refuse; tree unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  assert.match(shellFailReason(g().bodyMesh, 0), /壁厚必須大於 0/)
  assert.match(shellFailReason(g().bodyMesh, 30), /壁厚 30 mm 過大 — 實體最薄方向只有約 10 mm/)
  assert.equal(splitPlaneMissReason(g().bodyMesh, { axis: 'Z', offset: 5 }), null)
  assert.match(
    splitPlaneMissReason(g().bodyMesh, { axis: 'Z', offset: 50 }),
    /Z = 50 mm 的平面沒有穿過實體（實體在 Z 方向範圍為 0～10 mm）/,
  )

  await g().applyFeatures(
    [BOX, { id: 'S', type: 'shell', thickness: 30, nears: [[20, 15, 10]] }],
    'shell oversize',
    true,
  )
  assert.match(g().status, /抽殼失敗：壁厚 30 mm 過大/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /重建失[敗败]/)
  assert.equal(g().features.filter((f) => f.type === 'shell').length, 0)

  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, 40 * 30 * 10, 1), `seed vol ${v0}`)
  g().openFeatDlg('splitbody')
  g().setFeatParam('axis', 'Z')
  g().setFeatParam('offset', 50)
  await g().commitFeatDlg()
  assert.match(g().status, /沒有穿過實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.length, 1)
  assert.equal(g().features.some((f) => f.type === 'split' || f.type === 'splitbody'), false)
  assert.ok(near(await volSTEP(), v0, 1), 'split miss must keep volume')
})
