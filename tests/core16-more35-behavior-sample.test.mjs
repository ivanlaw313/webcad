/**
 * BOT-D more35 / FISHING55+ — CORE16 true behavior / regression gaps on tip 3e96162.
 * Complements smoke-21 + more34 sample without duplicating those topics.
 * more34 (2da0543) already covers: box/cyl-cut vol, revolve/sweep refuse, refuse→360,
 * fillet-then-refuse, MATERIALS+F54 Formal always-hard.
 * Focus here: copy independence, boolean delta, shell→fillet, split sum, pattern-after-cut,
 * hole csink, move cancel, emboss refuse keep, undo two-step.
 * Always-hard: MATERIALS SC keep + one F54 Formal regression line.
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
const { importSTEP, measureVolume } = await import('replicad')
const { computeMassProps } = await import('../src/cad/massProps.ts')

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
const meshVol = (m) => {
  if (!m?.vertices?.length || !m?.triangles?.length) return 0
  return computeMassProps(m.vertices, m.triangles).volume
}
const parkedVol = (idx = 0) => {
  const pb = g().bodyMesh?.parked?.[idx]
  if (!pb?.vertices?.length) return 0
  return computeMassProps(pb.vertices, pb.triangles).volume
}
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const near = (a, b, t = 1) => Math.abs(a - b) < t

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const BOX_VOL = 40 * 30 * 20 // 24000
const BOX_FLAT = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }

// ── always-hard: MATERIALS + F54 Formal ──────────────────────────

test('always-hard: MATERIALS / DENSITY_PREF stay SC (storage ids)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('always-hard: FISHING54 Formal regression (太陽輪 + 精確布爾)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /太陽輪 z\$\{zs\}/)
  assert.match(st, /manifold 精確布爾/)
  assert.doesNotMatch(st, /太阳轮 z\$\{zs\}/)
  assert.doesNotMatch(st, /精确布尔/)
})

// ── copy-body independence ───────────────────────────────────────

test('runtime: createCopy parks independent body; active cut leaves parked vol', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX_FLAT], 'box'), true, g().status)
  const seed = 40 * 30 * 10
  assert.ok(near(await volSTEP(), seed, 1))

  g().openFeatDlg('move')
  for (const [k, v] of [
    ['moveType', 'translate'],
    ['dx', 55],
    ['dy', 0],
    ['dz', 0],
    ['createCopy', 1],
  ]) {
    g().setFeatParam(k, v)
  }
  await g().commitFeatDlg()
  assert.match(g().status, /^已複製並移動實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().features.some((f) => f.type === 'copybody'))
  const pIdx = (g().bodyMesh?.parked?.length ?? 1) - 1
  const pv0 = parkedVol(pIdx)
  assert.ok(near(pv0, seed, 50), `parked copy ${pv0}`)

  // Cut active only (circle through plate) — parked copy must keep prior volume
  const cut = {
    id: 'C',
    type: 'extrude',
    profile: { kind: 'circle', c: [20, 15], r: 5 },
    height: 10,
    operation: 'cut',
  }
  const kept = g().features.filter((f) => f.id !== 'C')
  assert.equal(await g().applyFeatures([...kept, cut], 'cut active'), true, g().status)
  const pv1 = parkedVol(0)
  assert.ok(near(pv1, seed, 80), `parked unchanged after active cut: ${pv1} vs ${seed}`)
  const activeV = meshVol(g().bodyMesh)
  assert.ok(activeV < seed - 50, `active cut shrinks ${activeV}`)
})

// ── boolean combine cut volume delta ─────────────────────────────

test('runtime: combine cut → volume drops by overlapping tool', async () => {
  reset()
  const small = { id: 's', type: 'prim', shape: 'box', a: 20, b: 20, c: 10, op: 'new', cornerOrigin: true }
  const park = { id: 'nb', type: 'newbody', name: '實體1' }
  const big = { id: 'big', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
  assert.equal(await g().applyFeatures([small, park, big], 'cut setup'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, 12000, 1), `seed ${v0}`)

  g().openCombineDlg()
  g().setFeatParam('op', 'cut')
  g().setFeatParam('tool0', 1)
  await g().commitFeatDlg()
  assert.ok(g().features.some((f) => f.type === 'bodyboolean' && f.bop === 'cut'), g().status)
  const v1 = await volSTEP()
  assert.ok(v1 < v0 - 1000, `cut reduces ${v0} → ${v1}`)
  assert.ok(near(v1, 8000, 50), `cut vol ${v1} expect ~8000`)
})

// ── shell then fillet keep solid ─────────────────────────────────

test('runtime: shell thickness then fillet keeps solid (hollow + round)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, BOX_VOL, 1))

  const shell = {
    id: 'S',
    type: 'shell',
    thickness: 2,
    nears: [[20, 15, 20]],
    tangentChain: true,
    direction: 'inside',
  }
  assert.equal(await g().applyFeatures([BOX, shell], 'shell'), true, g().status)
  const vShell = await volSTEP()
  assert.ok(vShell < v0 - 500, `shell hollows ${v0} → ${vShell}`)
  assert.ok(vShell > 100, `shell solid ${vShell}`)
  assert.ok(g().features.some((f) => f.type === 'shell'))

  // Small radius on shelled body (wall=2); product Formal may refuse oversized rounds —
  // either PASS (volume stays solid) or refuse keeps shelled volume (no silent wipe).
  const fillet = { id: 'F', type: 'fillet', radius: 0.5, edges: 'all' }
  const ok = await g().applyFeatures([BOX, shell, fillet], 'shell+fillet', true)
  if (ok) {
    assert.ok(g().features.some((f) => f.type === 'fillet'), g().status)
    const v1 = await volSTEP()
    assert.ok(v1 > 100, `still solid after shell+fillet ${v1}; status=${g().status}`)
    assert.ok(v1 <= vShell + 1, `fillet must not inflate past shell ${v1} vs ${vShell}`)
  } else {
    assert.match(g().status, /無法建立圓角|圓角|半徑/)
    assert.equal(g().features.filter((f) => f.type === 'fillet').length, 0)
    const vKeep = await volSTEP()
    assert.ok(near(vKeep, vShell, 2), `fillet refuse keeps shelled vol ${vKeep} vs ${vShell}`)
  }
  assert.doesNotMatch(g().status, /⚠ 重建失败[^-]/)
  assert.doesNotMatch(g().status, COLLOQ)
})

// ── split-body volume sum ────────────────────────────────────────

test('runtime: split-body mid-plane → two solids; volumes sum ≈ original', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(near(v0, BOX_VOL, 1))

  g().openFeatDlg('splitbody')
  g().setFeatParam('axis', 'Z')
  g().setFeatParam('offset', 10)
  g().setFeatParam('keep', 'hi')
  await g().commitFeatDlg()

  assert.ok(g().features.some((f) => f.type === 'split'), g().status)
  const parked = g().bodyMesh?.parked ?? []
  assert.equal(parked.length, 1, `parked half; status=${g().status}`)
  const vActive = meshVol(g().bodyMesh)
  const vPark = meshVol(parked[0])
  assert.ok(vActive > 100 && vPark > 100, `halves ${vActive}+${vPark}`)
  assert.ok(Math.abs(vActive + vPark - v0) < 5, `sum ${vActive + vPark} vs ${v0}`)
})

// ── rect pattern after cut ───────────────────────────────────────

test('runtime: 2×1 body pattern after cut multiplies volume (no silent no-op)', async () => {
  reset()
  const box = {
    id: 'box',
    type: 'prim',
    shape: 'box',
    a: 50,
    b: 40,
    c: 20,
    cornerOrigin: true,
    op: 'new',
  }
  const cut = {
    id: 'cut',
    type: 'extrude',
    profile: { kind: 'rect', a: [5, 5], b: [25, 25] },
    height: 20,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([box, cut], 'seed'), true, g().status)
  const seed = await volSTEP()
  const solid = 50 * 40 * 20
  const cutVol = 20 * 20 * 20
  assert.ok(near(seed, solid - cutVol, 1), `seed ${seed}`)

  const pat = {
    id: 'pat',
    type: 'pattern',
    countX: 2,
    countY: 1,
    countZ: 1,
    dx: 70,
    dy: 0,
    dz: 0,
    objectType: 'bodies',
  }
  assert.equal(await g().applyFeatures([box, cut, pat], '2x1'), true, g().status)
  const after = await volSTEP()
  assert.ok(near(after, seed * 2, 1), `pattern after cut: ${after} want ${seed * 2}`)
  assert.ok(after > seed + 1000)
})

// ── hole countersink through volume ──────────────────────────────

test('runtime: countersink through hole cuts more volume than simple through', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await volSTEP()

  const simple = {
    id: 'hs',
    type: 'hole',
    kind: 'simple',
    center: [20, 15],
    top: 20,
    diameter: 6,
    through: true,
    extent: 'through-all',
  }
  assert.equal(await g().applyFeatures([BOX, simple], 'simple'), true, g().status)
  const vSimple = await volSTEP()

  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed2'), true, g().status)
  const csink = {
    id: 'hc',
    type: 'hole',
    kind: 'countersink',
    center: [20, 15],
    top: 20,
    diameter: 6,
    through: true,
    extent: 'through-all',
    countersink: { diameter: 12, angle: 90 },
  }
  assert.equal(await g().applyFeatures([BOX, csink], 'csink'), true, g().status)
  const vCs = await volSTEP()

  assert.ok(vSimple < v0 - 10, `simple ${v0}→${vSimple}`)
  assert.ok(vCs < vSimple - 1, `csink cuts more: simple=${vSimple} csink=${vCs}`)
  assert.ok(g().features.some((f) => f.type === 'hole' && f.kind === 'countersink'))
})

// ── move cancel restores volume ──────────────────────────────────

test('runtime: move/copy cancel restores volume (no transform feature)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX_FLAT], 'box'), true, g().status)
  const v0 = await volSTEP()
  const n0 = g().features.length

  g().openFeatDlg('move')
  g().setFeatParam('moveType', 'translate')
  g().setFeatParam('dx', 99)
  g().setFeatParam('dy', 88)
  g().setFeatParam('createCopy', 0)
  g().cancelFeatDlg()

  assert.equal(g().featDlg, null)
  assert.match(g().status, /已取消/)
  assert.equal(g().features.length, n0)
  assert.ok(!g().features.some((f) => f.type === 'transform' || f.type === 'copybody'))
  const v1 = await volSTEP()
  assert.ok(near(v1, v0, 1), `cancel keeps vol ${v1} vs ${v0}`)
})

// ── emboss empty-depth refuse keeps prior ────────────────────────

test('runtime: emboss depth 0 refuse keeps prior solid volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const v0 = await volSTEP()
  const n0 = g().features.length

  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'AB', depth: 0, size: 8, mode: 'emboss' },
      payload: { arbPlane: { o: [20, 15, 20], xd: [1, 0, 0], n: [0, 0, 1] } },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：浮雕深度必須大於 0|尺寸已拒絕：浮雕字高和深度都必須大於 0|浮雕深度必須大於 0/)
  assert.ok(g().featDlg?.kind === 'emboss', 'dlg stays open')
  assert.equal(g().features.length, n0)
  assert.ok(!g().features.some((f) => f.type === 'text' || f.type === 'emboss'))
  const v1 = await volSTEP()
  assert.ok(near(v1, v0, 1), `refuse keeps vol ${v1} vs ${v0}`)
})

// ── undo two-step volume ─────────────────────────────────────────

test('runtime: two-step undo restores volume stepwise (box→fillet→cut)', async () => {
  reset()
  const fillet = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }
  const hole = {
    id: 'H',
    type: 'extrude',
    profile: { kind: 'circle', c: [20, 15], r: 4 },
    height: 20,
    operation: 'cut',
  }

  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  const vBox = await volSTEP()
  assert.ok(near(vBox, BOX_VOL, 1))

  assert.equal(await g().applyFeatures([BOX, fillet], 'fillet'), true, g().status)
  const vFillet = await volSTEP()
  assert.ok(vFillet < vBox - 1)

  assert.equal(await g().applyFeatures([BOX, fillet, hole], 'cut'), true, g().status)
  const vHole = await volSTEP()
  assert.ok(vHole < vFillet - 10)

  await g().undo()
  assert.ok(near(await volSTEP(), vFillet, 1), '1st undo → fillet vol')
  await g().undo()
  assert.ok(near(await volSTEP(), vBox, 1), '2nd undo → box vol')
})
