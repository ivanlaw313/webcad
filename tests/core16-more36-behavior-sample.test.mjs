/**
 * BOT-D more36 / FISHING56+ — CORE16 true behavior / regression gaps on tip 4c82085.
 * Complements smoke-21 + more34 + more35 samples without duplicating those topics.
 * more34: box/cyl-cut vol, revolve/sweep refuse, refuse→360, fillet-then-refuse, MATERIALS+F54.
 * more35: MATERIALS+F54, copy independence, boolean cut, shell→fillet, split sum,
 * pattern-after-cut, hole csink, move cancel, emboss refuse, undo two-step.
 * Focus here: hide/show rebuild, arb through-cut, chamfer two-dist asym, loft thin-wall,
 * thicken chip 99999, timeline reorder, pushpull dist gate, cone/cyl labels+vol, STEP fail.
 * Always-hard: MATERIALS SC keep + FISHING56 Formal 趨勢著色 (產品 93348ac regression).
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
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')
const { ACTIVE_BODY_KEY } = await import('../src/ui/contextMenus.ts')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')
const {
  featureKindLabel,
  isCylinderPrimitive,
  isConePrimitive,
} = await import('../src/ui/featureLabel.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
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
const BOX_VOL = 40 * 30 * 20 // 24000
const BOX40 = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 40, c: 40, op: 'new', cornerOrigin: true }
const FILLET = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }

// ── always-hard: MATERIALS + FISHING56 Formal 趨勢著色 ───────────

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('always-hard: FISHING56 Formal 趨勢著色 present; 趨勢着色 absent (Viewport/store/ribbon)', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  const rb = rd('src/ribbon.ts')
  assert.match(vp, /趨勢著色/)
  assert.match(st, /趨勢著色/)
  assert.match(rb, /趨勢著色/)
  assert.doesNotMatch(vp, /趨勢着色/)
  assert.doesNotMatch(st, /趨勢着色/)
  assert.doesNotMatch(rb, /趨勢着色/)
})

// ── hide → rebuild fillet → show ─────────────────────────────────

test('runtime: hide active → rebuild fillet → show: volume coherent; bodyHidden persists then clears', async () => {
  reset()
  assert.ok(await g().applyFeatures([BOX], 'box'), g().status)
  const vBox = await volSTEP()
  assert.ok(near(vBox, BOX_VOL, 1), `box vol ${vBox}`)

  g().toggleBodyHidden(ACTIVE_BODY_KEY)
  assert.deepEqual(g().bodyHidden, ['active'])
  assert.equal(g().status, '已隱藏實體')
  assert.doesNotMatch(g().status, COLLOQ)

  assert.ok(await g().applyFeatures([BOX, FILLET], 'fillet while hidden'), g().status)
  assert.deepEqual(g().bodyHidden, ['active'], 'hide survives rebuild')
  assert.equal(g().failedFeatureIds.length, 0, g().status)
  const vFillet = await volSTEP()
  assert.ok(vFillet < vBox - 1, `fillet cuts while hidden: ${vFillet} < ${vBox}`)
  assert.ok(Number.isFinite(vFillet) && vFillet > 0)

  g().toggleBodyHidden(ACTIVE_BODY_KEY)
  assert.deepEqual(g().bodyHidden, [])
  assert.equal(g().status, '已顯示實體')
  const vShow = await volSTEP()
  assert.ok(near(vShow, vFillet, 1), `show keeps fillet vol ${vShow} vs ${vFillet}`)
})

// ── arbPlane through-cut ─────────────────────────────────────────

test('runtime: arbPlane through-cut from top face drills whole plate (volume drops)', async () => {
  reset()
  const plate = {
    id: 'plate',
    type: 'extrude',
    profile: { kind: 'rect', a: [-30, -20], b: [30, 20] },
    height: 8,
    operation: 'new',
  }
  const circle = { kind: 'circle', c: [0, 0], r: 5 }
  const area = Math.PI * 25
  assert.ok(await g().applyFeatures([plate], 'plate'), g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, 19200, 2), `plate ${v0}`)

  const cut = {
    id: 'c1',
    type: 'extrude',
    profile: circle,
    height: 0,
    operation: 'cut',
    through: true,
    arbPlane: { o: [5, 3, 8], xd: [1, 0, 0], n: [0, 0, 1] },
  }
  assert.ok(await g().applyFeatures([plate, cut], 'arb through'), g().status)
  const v1 = await volSTEP()
  assert.ok(near(v1, 19200 - area * 8, 2), `through-cut ${v1}`)
  assert.ok(v1 < v0 - 100, `volume drops ${v0} → ${v1}`)
})

// ── chamfer two-dist asymmetric vs equal ─────────────────────────

test('runtime: chamfer two-dist asymmetric changes volume differently from equal dist', async () => {
  reset()
  const nearEdge = [[20, 0, 40]]
  assert.ok(
    await g().applyFeatures(
      [BOX40, { id: 'ce', type: 'chamfer', distance: 3, nears: nearEdge, cmode: 'equal', chain: false }],
      'eq',
    ),
    g().status,
  )
  const ve = await volSTEP()

  assert.ok(
    await g().applyFeatures(
      [
        BOX40,
        {
          id: 'ct',
          type: 'chamfer',
          distance: 3,
          dist2: 8,
          nears: nearEdge,
          cmode: 'two',
          chain: false,
        },
      ],
      'two',
    ),
    g().status,
  )
  const vt = await volSTEP()
  assert.ok(Math.abs(vt - ve) > 200, `asymmetric must differ from equal: ${vt} vs ${ve}`)
  assert.ok(vt < 64000 - 200, `two-dist drops from cube ${vt}`)
  assert.doesNotMatch(g().status, COLLOQ)
})

// ── loft thin-wall legal + absurd Formal fallback ────────────────

test('runtime: loft thin-wall legal hollow succeeds; absurd wall → Formal solid-fallback (no hang)', async () => {
  reset()
  const bank = (plane, z, shape) => {
    g().sketchOnDatumPlane(plane, z)
    useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] })
    g().addLoftSection()
  }
  const preview = async () => {
    g().scheduleLoftPreview()
    for (let i = 0; i < 1000 && (g().loftPreviewBusy || !g().loftPreview); i++) {
      await new Promise((r) => setTimeout(r, 30))
    }
    return g().loftPreview
  }
  const FAIL_WALL = /放樣薄壁 .+ 失敗，已退回實心放樣（請減小薄壁厚度或簡化截面）/

  bank('XY', 0, { type: 'rect', a: [-20, -20], b: [20, 20] })
  bank('XY', 60, { type: 'circle', c: [0, 0], r: 15 })
  g().openLoftDlg()
  const solid = (await preview()).volume
  g().setLoftOpt({ loftWall: 2 })
  const t0 = Date.now()
  const thin = await preview()
  assert.ok(thin?.mesh && thin.volume < solid * 0.6 && thin.volume > 500, `thin ${thin?.volume} vs solid ${solid}`)
  assert.ok(!thin.warnings.some((w) => /失敗|退回/.test(w)), thin.warnings.join(';'))
  await g().commitLoft()
  assert.ok(Date.now() - t0 < 40000, 'legal thin must not hang')
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 1, g().status)
  const vThin = await volSTEP()
  assert.ok(Math.abs(vThin - thin.volume) < 1e-3 * thin.volume, `commit ${vThin} ≈ ${thin.volume}`)
  assert.doesNotMatch(g().status, COLLOQ)

  // absurd wall on fresh loft
  reset()
  bank('XY', 0, { type: 'rect', a: [-20, -20], b: [20, 20] })
  bank('XY', 60, { type: 'circle', c: [0, 0], r: 15 })
  g().openLoftDlg()
  const solidVol = (await preview()).volume
  g().setLoftOpt({ loftWall: 50 })
  const t1 = Date.now()
  const pv = await preview()
  assert.ok(pv?.mesh && !pv.error, `preview must not hang/error: ${pv?.error}`)
  assert.ok(Date.now() - t1 < 40000, `absurd preview ${Date.now() - t1} ms`)
  assert.ok(pv.warnings.some((w) => FAIL_WALL.test(w)), `fallback warn: ${pv.warnings.join(';')}`)
  assert.ok(Math.abs(pv.volume - solidVol) / solidVol < 0.05, `fallback ≈ solid ${pv.volume}`)
  await g().commitLoft()
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 1, g().status)
  const loft = g().features.find((f) => f.type === 'loft')
  assert.equal(loft.wall, 50, 'wall param kept; geometry fell back to solid')
  const v = await volSTEP()
  assert.ok(Math.abs(v - solidVol) / solidVol < 0.05, `committed solid fallback ${v}`)
})

// ── thicken timeline chip 99999 Formal refuse ────────────────────

test('runtime: thicken timeline chip 99999 → Formal oversize refuse; tree unchanged', async () => {
  reset()
  const TOP = [20, 10, -15]
  assert.equal(await g().applyFeatures([{ ...BOX, c: 10 }], 'box'), true, g().status)
  g().toggleThicken()
  await g().thickenFaceAt(TOP)
  g().setThicken({ thick: 2 })
  await g().commitThicken()
  const f = g().features.find((x) => x.type === 'thickenface')
  assert.ok(f, g().status)
  const before = structuredClone(g().features)
  await g().editFeature(f.id, { thick: 99999, side: 'pos' })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /^尺寸已拒絕：加厚厚度 99999 mm/)
  assert.match(g().status, /過大|超過上限/)
  assert.doesNotMatch(g().status, /已更新參數並重建/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.find((x) => x.id === f.id)?.thick, 2)
})

// ── timeline reorder two fillets + undo ──────────────────────────

test('runtime: timeline reorder two fillets legal + undo restores order', async () => {
  reset()
  const box = { id: 'prim1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }
  assert.ok(await g().applyFeatures([box], 'box'), g().status)
  const f1 = { id: 'fil1', type: 'fillet', radius: 3, nears: [[40, 0, 40]] }
  assert.ok(await g().applyFeatures([...g().features, f1], 'f1'), g().status)
  const f2 = { id: 'fil2', type: 'fillet', radius: 5, nears: [[40, 60, 40]] }
  assert.ok(await g().applyFeatures([...g().features, f2], 'f2'), g().status)
  const ids = () => g().features.map((f) => f.id)
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
  const u0 = g().undoStack.length

  assert.equal(await g().reorderFeature('fil2', 1), true)
  assert.deepEqual(ids(), ['prim1', 'fil2', 'fil1'])
  assert.equal(g().undoStack.length, u0 + 1)
  assert.match(g().status, /已上移|已下移|已還原/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().failedFeatureIds.length, 0)

  await g().undo()
  assert.deepEqual(ids(), ['prim1', 'fil1', 'fil2'])
})

// ── pushpull dist 0 Formal refuse + legal +/− ────────────────────

test('runtime: pushpull dist 0 Formal refuse; legal +dist increases / −dist decreases volume', async () => {
  reset()
  assert.equal(
    await g().applyFeatures([BOX, { id: 'P', type: 'pushpull', near: [20, 15, 20], dist: 5 }], 'seed'),
    true,
    g().status,
  )
  assert.equal(g().features.find((x) => x.id === 'P')?.dist, 5)
  const vBefore = await volSTEP()
  await g().editFeature('P', { dist: 0 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕：按拉距離不可為 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.find((x) => x.id === 'P')?.dist, 5)
  assert.ok(near(await volSTEP(), vBefore, 1e-3))

  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, BOX_VOL, 1), `seed ${v0}`)

  assert.equal(
    await g().applyFeatures([BOX, { id: 'P+', type: 'pushpull', near: [20, 15, 20], dist: 5 }], 'pull'),
    true,
    g().status,
  )
  const vPull = await volSTEP()
  assert.ok(vPull > v0 + 100, `pull grows: ${v0} → ${vPull}`)
  assert.ok(near(vPull, 40 * 30 * 25, 2), `expect ~30000 got ${vPull}`)

  assert.equal(
    await g().applyFeatures([BOX, { id: 'P-', type: 'pushpull', near: [20, 15, 20], dist: -4 }], 'push'),
    true,
    g().status,
  )
  const vPush = await volSTEP()
  assert.ok(vPush < v0 - 100, `push shrinks: ${v0} → ${vPush}`)
  assert.ok(near(vPush, 40 * 30 * 16, 2), `expect ~19200 got ${vPush}`)
})

// ── cylinder + cone Formal labels + volumes ──────────────────────

test('runtime: cylinder + cone create: Formal labels 圓柱／圓錐 + volumes ≈ πr²h / ⅓πr²h', async () => {
  reset()
  const createPrim = async (kind, params) => {
    useApp.setState({
      lang: 'zh-HK',
      featDlg: { kind, params: { op: 'new', px: 0, py: 0, pz: 0, ...params } },
    })
    await g().commitFeatDlg()
    return g().features.at(-1)
  }

  const d = 20,
    h = 30
  const cyl = await createPrim('cylinder', { d, h })
  assert.ok(cyl, g().status)
  assert.equal(isCylinderPrimitive(cyl), true, JSON.stringify(cyl))
  assert.equal(featureKindLabel(cyl, '拉伸'), '圓柱')
  assert.match(g().status, /圓柱|Ø/)
  assert.doesNotMatch(g().status, /拉伸/)
  assert.doesNotMatch(g().status, COLLOQ)
  const vCyl = await volSTEP()
  const expectCyl = Math.PI * (d / 2) ** 2 * h
  assert.ok(Math.abs(vCyl - expectCyl) < 5, `cyl vol ${vCyl} vs ${expectCyl}`)

  reset()
  const cone = await createPrim('cone', { d, dt: 0, h })
  assert.ok(cone, g().status)
  assert.equal(isConePrimitive(cone), true, JSON.stringify(cone))
  assert.equal(featureKindLabel(cone, '原語'), '圓錐')
  assert.match(g().status, /圓錐|錐/)
  assert.doesNotMatch(g().status, COLLOQ)
  const vCone = await volSTEP()
  const expectCone = (1 / 3) * Math.PI * (d / 2) ** 2 * h
  assert.ok(Math.abs(vCone - expectCone) < 8, `cone vol ${vCone} vs ${expectCone}`)
})

// ── importStep garbage → Formal STEP fail ────────────────────────

test('runtime: importStep garbage buffer → Formal STEP fail; no crash; no component', async () => {
  reset()
  const beforeComps = g().components.length
  const beforeFeats = g().features.length
  const junk = new TextEncoder().encode('NOT-A-STEP-FILE <<<garbage>>>').buffer
  await assert.doesNotReject(() => g().importStep(junk, 'junk.step'))
  assert.match(g().status, /無法插入|STEP／STP 匯入失敗|匯入失敗/)
  assert.doesNotMatch(g().status, /This shape|NullObject|Standard_Null|STEPCAFControl|has not type/i)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().components.length, beforeComps, 'no component on fail')
  assert.equal(g().features.length, beforeFeats, 'features unchanged')
  assert.equal(g().busy, false, 'busy cleared after fail')
})
