// UX3 #2：長方體／圓柱／圓錐／球對話框有位置（X Y Z + 📍 拾點）；預設操作「自動」——同現有實體有體積重疊 → 新實體
// （Fusion：基本體預設 New Body，唔會靜靜併入底板），淨係貼住（例如企喺板面）→ 照舊合併。真瀏覽器：scripts/e2e-ux3-assembly.mjs。
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp, primPlacementBox, meshBoxOverlap, PRIM_PLACE_KINDS } = await import('../src/store.ts')
const g = () => useApp.getState()
const bbox = (m) => { const v = m.vertices, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v[i + k]); mx[k] = Math.max(mx[k], v[i + k]) } return { mn, mx } }
async function prim(kind, params) {
  g().openFeatDlg(kind)
  for (const [k, v] of Object.entries(params)) g().setFeatParam(k, v)
  await g().commitFeatDlg()
  return g().features.at(-1)
}

test('placement box math + overlap is volume-only (touching ≠ overlap)', () => {
  assert.deepEqual([...PRIM_PLACE_KINDS].sort(), ['box', 'cone', 'cylinder', 'sphere'])
  const plate = { vertices: [0, 0, 0, 100, 80, 10] }
  assert.deepEqual(primPlacementBox('cylinder', { d: 20, h: 60 }, [50, 40, 0]), { min: [40, 30, 0], max: [60, 50, 60] })
  assert.equal(meshBoxOverlap(plate, primPlacementBox('cylinder', { d: 20, h: 60 }, [50, 40, 0])), true)
  assert.equal(meshBoxOverlap(plate, primPlacementBox('cylinder', { d: 20, h: 60 }, [50, 40, 10])), false)   // standing on top face
  assert.equal(meshBoxOverlap(plate, primPlacementBox('box', { l: 10, w: 10, h: 10 }, [200, 0, 0])), false)
})

test('dialogs default op=auto with X/Y/Z = 0', () => {
  for (const k of ['box', 'cylinder', 'sphere', 'cone']) {
    useApp.setState(useApp.getInitialState(), true)
    g().openFeatDlg(k)
    const p = g().featDlg.params
    assert.equal(p.op, 'auto', k); assert.equal(+p.px, 0); assert.equal(+p.py, 0); assert.equal(+p.pz, 0)
  }
})

test('shaft through plate → auto = new body, placed at X/Y; standing on plate → joins', async () => {
  useApp.setState(useApp.getInitialState(), true); useApp.setState({ lang: 'zh-HK' })
  const plate = await prim('box', { l: 100, w: 80, h: 10 })
  assert.equal(plate.op, 'new')
  const shaft = await prim('cylinder', { d: 20, h: 60, px: 50, py: 40, pz: -20 })
  assert.equal(shaft.operation, 'newbody', 'overlapping primitive defaults to a new body (not merged into plate)')
  assert.deepEqual(shaft.profile.c, [50, 40]); assert.equal(shaft.baseZ, -20)
  assert.match(g().status, /新實體（冇合併）/)
  const pk = g().bodyMesh.parked ?? []
  assert.equal(pk.length, 1, 'shaft is its own body (實體1), plate untouched')
  assert.deepEqual(bbox(g().bodyMesh).mx, [100, 80, 10])
  const b = bbox(pk[0])
  assert.ok(Math.abs(b.mn[0] - 40) < 0.5 && Math.abs(b.mx[0] - 60) < 0.5 && Math.abs(b.mn[1] - 30) < 0.5 && Math.abs(b.mx[1] - 50) < 0.5, 'shaft centred at X50 Y40')
  assert.ok(Math.abs(b.mn[2] + 20) < 0.5 && Math.abs(b.mx[2] - 40) < 0.5, 'shaft spans z −20..40: ' + JSON.stringify(b))
  // A cone standing on the plate top (touching only) keeps the old join behaviour.
  const cone = await prim('cone', { d: 20, dt: 0, h: 20, px: 20, py: 20, pz: 10 })
  assert.equal(cone.op, 'new')
  assert.deepEqual(cone.at, [20, 20, 10])
  // Explicit choice still wins.
  const cut = await prim('sphere', { d: 10, px: 80, py: 60, pz: 5, op: 'cut' })
  assert.equal(cut.op, 'cut'); assert.deepEqual(cut.at, [80, 60, 5])
})

test('placed box translates in the worker (corner at X/Y/Z)', async () => {
  useApp.setState(useApp.getInitialState(), true)
  await prim('box', { l: 10, w: 20, h: 30, px: 100, py: -50, pz: 5 })
  const b = bbox(g().bodyMesh)
  for (const [k, lo, hi] of [[0, 100, 110], [1, -50, -30], [2, 5, 35]]) { assert.ok(Math.abs(b.mn[k] - lo) < 1e-3 && Math.abs(b.mx[k] - hi) < 1e-3, JSON.stringify(b)) }
})
