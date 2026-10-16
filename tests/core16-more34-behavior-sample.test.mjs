/**
 * BOT-D more34 / FISHING55 prep — CORE16 true behavior sample on tip f86e16b.
 * Complements smoke-21 / existing core16-* without duplicating those files.
 * Focus: prim cut volume sanity + measureVolume after revolve/sweep refuse paths.
 * Always-hard: MATERIALS SC keep + FISHING54 Formal regressions (太陽輪 / 精確布爾 / 長L / 建立長方體).
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
const { useApp } = await import('../src/store.ts')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')
const { importSTEP, measureVolume } = await import('replicad')

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

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const BOX_VOL = 40 * 30 * 20 // 24000

const REV_PROF = { kind: 'rect', a: [10, 0], b: [30, 20] }

function openRevolveDlg(angle) {
  useApp.setState({
    featDlg: {
      kind: 'revolve',
      params: { axis: 'Y', angle, op: 'new', wall: 0, sym: 0, ox: 0, oy: 0, oz: 0, dx: 0, dy: 1, dz: 0 },
      payload: { prof: REV_PROF },
    },
  })
}

async function openSweepPathKeepingFeatures() {
  // Keep existing features; add an open path sketch then open sweep dlg.
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({ polyPts: [[0, 0], [50, 0]], polyBulges: [0], sketchTool: 'polyline' })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources).find((k) =>
    g().sketchSources[k].shapes.some((s) => s.type === 'poly' && s.open),
  )
  assert.ok(pathId, 'open path sketch')
  g().setSelSketch(pathId)
  await g().runCommand('sweep', 'Sweep')
  assert.equal(g().sweepDlgOpen, true, g().status)
  useApp.setState({ sketchOp: 'new', sweepSection: 'circle' })
}

// ── always-hard: MATERIALS + F54 Formal regressions ──────────────

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('always-hard: FISHING54 Formal regressions still present', () => {
  const st = rd('src/store.ts')
  const tools = rd('src/ai/tools.ts')
  assert.match(st, /太陽輪 z\$\{zs\}/)
  assert.match(st, /manifold 精確布爾/)
  assert.match(st, /addParam\('長L'/)
  assert.match(tools, /建立長方體（mm）/)
  assert.doesNotMatch(st, /太阳轮 z\$\{zs\}/)
  assert.doesNotMatch(st, /精确布尔/)
  assert.doesNotMatch(st, /addParam\('长L'/)
  assert.doesNotMatch(tools, /建立长方体（mm）/)
})

// ── volume sanity: box + prim cut ────────────────────────────────

test('runtime: box seed volume exact 40×30×20', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const v = await volSTEP()
  assert.ok(Math.abs(v - BOX_VOL) < 1, `seed ${v}`)
})

test('runtime: box + cylinder cut → volume decreases by ≈ πr²·overlap', async () => {
  reset()
  // Cylinder Ø16 (r=8) through 20 mm height, centered in box XY → full-height through cut.
  // applyFeatures prim cut: shape cylinder a=r? Check existing — hide-show uses a:10,b:10,c:20 as dims.
  // From cone-cylinder createPrim: d,h via dialog. For feature array, worker prim cylinder:
  // typically a=diameter or radius — use known-good from b3: a:10,b:10,c:20 with newbody.
  // Prefer dialog path for cut:
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(Math.abs(v0 - BOX_VOL) < 1, `seed ${v0}`)

  useApp.setState({
    featDlg: {
      kind: 'cylinder',
      params: { op: 'cut', d: 16, h: 30, px: 20, py: 15, pz: 0 },
    },
  })
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.match(g().status, /已切割圓柱/)
  // Dialog cylinder-cut is stored as extrude circle profile (not prim shape)
  const cut = g().features.find((f) => f.type === 'extrude' && f.operation === 'cut')
  assert.ok(cut, g().status)
  assert.equal(cut.profile?.kind, 'circle')
  assert.ok(Math.abs(cut.profile.r - 8) < 1e-6)

  const v1 = await volSTEP()
  assert.ok(v1 < v0, `cut must shrink: ${v1} < ${v0}; status=${g().status}`)
  const expectRemoved = Math.PI * 8 * 8 * 20 // through plate height
  assert.ok(Math.abs(v1 - (BOX_VOL - expectRemoved)) < 2, `cut vol ${v1} vs ${BOX_VOL - expectRemoved}`)
})

// ── measureVolume after revolve / sweep refuse ───────────────────

test('runtime: after solid, revolve angle 0 refuse → volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const v0 = await volSTEP()
  const n0 = g().features.length
  openRevolveDlg(0)
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：旋轉角度必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().featDlg?.kind === 'revolve', 'dlg stays open')
  assert.equal(g().features.length, n0)
  assert.ok(!g().features.some((f) => f.type === 'revolve'))
  const v1 = await volSTEP()
  assert.ok(Math.abs(v1 - v0) < 1, `refuse must keep volume ${v1} vs ${v0}`)
})

test('runtime: after solid, sweep Ø=0 refuse → volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const v0 = await volSTEP()
  const ids0 = g().features.map((f) => f.id)

  await openSweepPathKeepingFeatures()
  g().setSweepDia(0)
  await g().commitSweepPath()
  assert.equal(g().sweepDlgOpen, true)
  assert.ok(isIllegalRejectStatus(g().sweepError), g().sweepError)
  assert.match(g().sweepError || '', /管徑 Ø 必須大於 0/)
  assert.ok(!g().features.some((f) => f.type === 'sweep'))
  assert.ok(ids0.every((id) => g().features.some((f) => f.id === id)), 'prior features kept')

  const v1 = await volSTEP()
  assert.ok(Math.abs(v1 - v0) < 1, `sweep refuse must keep volume ${v1} vs ${v0}`)
})

test('runtime: revolve refuse then legal angle 360 recovers (dlg atomic)', async () => {
  reset()
  openRevolveDlg(0)
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：旋轉角度必須大於 0/)
  assert.ok(g().featDlg?.kind === 'revolve')
  assert.ok(!g().features.some((f) => f.type === 'revolve'))
  g().setFeatParam('angle', 360)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  const f = g().features.find((x) => x.type === 'revolve')
  assert.ok(f, g().status)
  assert.equal(f.angle, 360)
  const v = await volSTEP()
  assert.ok(v > 1000, `360° revolve vol ${v}; status=${g().status}`)
})

test('runtime: fillet all on box → volume decreases; then revolve refuse keeps filleted vol', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const v0 = await volSTEP()
  const fillet = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }
  assert.equal(await g().applyFeatures([BOX, fillet], 'fillet'), true, g().status)
  const v1 = await volSTEP()
  assert.ok(v1 < v0, `fillet shrinks ${v1} < ${v0}`)
  assert.ok(v1 > v0 * 0.7, `fillet not catastrophic ${v1}`)

  const n0 = g().features.length
  openRevolveDlg(0)
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：旋轉角度必須大於 0/)
  assert.equal(g().features.length, n0)
  const v2 = await volSTEP()
  assert.ok(Math.abs(v2 - v1) < 1, `refuse keeps filleted vol ${v2} vs ${v1}`)
})
