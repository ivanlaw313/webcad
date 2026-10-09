// UX3 #2 / WORKFLOW2：長方體／圓柱／圓錐／球對話框有位置（X Y Z + 📍 拾點）；預設操作「自動」——
// 模型已有實體時一律新實體（獨立體，無論 AABB 是否重疊）；空白模型首件仍用 new（Join／建立活動體）。
// newbody 語意：新件成活動體，舊活動體泊入 parked（唔係靜默 Join 成一塊兩坨）。
// 真瀏覽器：scripts/e2e-ux3-assembly.mjs。
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

test('empty model: auto → new (first solid)', async () => {
  useApp.setState(useApp.getInitialState(), true); useApp.setState({ lang: 'zh-HK' })
  const plate = await prim('box', { l: 100, w: 80, h: 10 })
  assert.equal(plate.op, 'new', 'first solid in empty model stays new (active body)')
  assert.equal((g().bodyMesh.parked ?? []).length, 0)
  assert.deepEqual(bbox(g().bodyMesh).mx, [100, 80, 10])
})

test('auto with existing solid: overlap AND no-overlap both → newbody', async () => {
  useApp.setState(useApp.getInitialState(), true); useApp.setState({ lang: 'zh-HK' })
  const plate = await prim('box', { l: 100, w: 80, h: 10 })
  assert.equal(plate.op, 'new')

  // Overlapping shaft through plate → newbody + overlap status suffix
  const shaft = await prim('cylinder', { d: 20, h: 60, px: 50, py: 40, pz: -20 })
  assert.equal(shaft.operation, 'newbody', 'overlapping primitive → newbody')
  assert.deepEqual(shaft.profile.c, [50, 40]); assert.equal(shaft.baseZ, -20)
  assert.match(g().status, /新實體（沒有合併）/)
  assert.match(g().status, /重疊/)
  // newbody：新圓柱成活動體，底板泊入 parked（唔係 Join）
  let pk = g().bodyMesh.parked ?? []
  assert.equal(pk.length, 1, 'plate parked as 實體1; shaft is active')
  const shaftB = bbox(g().bodyMesh)
  assert.ok(Math.abs(shaftB.mn[0] - 40) < 0.5 && Math.abs(shaftB.mx[0] - 60) < 0.5, 'active shaft X 40..60')
  assert.ok(Math.abs(shaftB.mn[2] + 20) < 0.5 && Math.abs(shaftB.mx[2] - 40) < 0.5, 'active shaft Z −20..40')
  assert.deepEqual(bbox(pk[0]).mx.map((v) => Math.round(v)), [100, 80, 10], 'parked plate keeps 100×80×10')

  // WORKFLOW2：分離圓柱（AABB 唔重疊）亦必須 newbody，唔好靜默 Join 成一塊兩坨
  const side = await prim('cylinder', { d: 20, h: 20, px: 140, py: 40, pz: 0 })
  assert.equal(side.operation, 'newbody', 'non-overlapping primitive → newbody (not merged lump)')
  assert.match(g().status, /分離 → 新實體/)
  assert.doesNotMatch(g().status, /重疊/)
  pk = g().bodyMesh.parked ?? []
  assert.equal(pk.length, 2, 'two parked bodies + active side cylinder = three independent bodies')
  const sideB = bbox(g().bodyMesh)
  assert.ok(Math.abs(sideB.mn[0] - 130) < 0.5 && Math.abs(sideB.mx[0] - 150) < 0.5, 'active side cylinder at X140')
  // 活動體 bbox 唔包住底板／軸（證明冇靜默 Join）
  assert.ok(sideB.mx[0] < 160 && sideB.mn[0] > 120, 'active body is only the side cylinder, not a multi-lump union')

  // Touching-only (standing on plate) also → newbody
  const cone = await prim('cone', { d: 20, dt: 0, h: 20, px: 20, py: 20, pz: 10 })
  assert.equal(cone.op, 'newbody', 'touching-only placement → newbody (no silent join)')
  assert.deepEqual(cone.at, [20, 20, 10])
  assert.match(g().status, /分離 → 新實體/)
  assert.equal((g().bodyMesh.parked ?? []).length, 3, 'cone parks previous active; 3 parked + 1 active')

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
