/**
 * CORE16 residual more12: Extrude Two Sides side2=0 must Formal refuse,
 * not silent-coerce → 10 via setExtrudeSide2. Complements
 * core16-extrude-two-side-sym-distance (which bypassed coerce via setState).
 * Tests only; product fix deploys separately — assert desired Formal; report A if tip coerces.
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
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /第二侧|请输入有限非零/

function seedSketchRect() {
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'rect', a: [-10, -10], b: [10, 10] },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
    extrudeDlgOpen: true,
    extrudeExtent: 'twosides',
    extrudeHeight: 10,
  })
}

test('source: setExtrudeSide2 must not coerce 0/NaN → 10 (desired Formal refuse)', () => {
  const st = rd('src/store.ts')
  // Old tip: setExtrudeSide2: (n) => set({ extrudeSide2: … ? Math.abs(n) : 10 })
  const coerces = /setExtrudeSide2:\s*\(n\)\s*=>\s*set\(\{\s*extrudeSide2:\s*Number\.isFinite\(n\)\s*&&\s*Math\.abs\(n\)\s*>\s*1e-6\s*\?\s*Math\.abs\(n\)\s*:\s*10\s*\}\)/.test(st)
  assert.equal(
    coerces,
    false,
    'A: tip setExtrudeSide2 still coerces illegal → 10 — product should refuse (keep prior or store 0 for commit Formal gate)',
  )
  // Desired: commit gate Formal 第二側 still present
  assert.match(st, /請輸入有限非零的第二側拉伸距離/)
  assert.doesNotMatch(st, /请输入有限非零的第二侧/)
})

test('runtime: setExtrudeSide2(0) must NOT become 10 (refuse, not coerce)', () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  g().setExtrudeSide2(7)
  assert.equal(g().extrudeSide2, 7)
  g().setExtrudeSide2(0)
  assert.notEqual(
    g().extrudeSide2,
    10,
    `A: setExtrudeSide2(0) coerced to 10 (got ${g().extrudeSide2}); desired Formal refuse keeps prior or stores 0`,
  )
  // Accept either keep-prior (7) or store-0 for commit gate
  assert.ok(
    g().extrudeSide2 === 7 || g().extrudeSide2 === 0,
    `refuse shape: keep prior 7 or store 0 for Formal commit; got ${g().extrudeSide2}`,
  )
})

test('runtime: setExtrudeSide2(NaN / blank-ish) must NOT become 10', () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', extrudeSide2: 5 }, true)
  g().setExtrudeSide2(Number.NaN)
  assert.notEqual(g().extrudeSide2, 10, `A: NaN coerced to 10; got ${g().extrudeSide2}`)
  assert.ok(g().extrudeSide2 === 5 || g().extrudeSide2 === 0, `got ${g().extrudeSide2}`)
})

test('runtime: twosides side2=0 via setter → Formal 第二側 refuse; no feature', async () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  seedSketchRect()
  g().setExtrudeSide2(8)
  g().setExtrudeSide2(0)
  // If tip still coerces → 10, force 0 via setState so commit Formal is still exercised,
  // but first assert already flagged A on coerce. Prefer desired: setter left 0 or prior.
  if (g().extrudeSide2 === 10) {
    useApp.setState({ extrudeSide2: 0 }) // document A path for commit gate only
  }
  const n0 = g().features.length
  await g().extrudeSketch()
  assert.match(g().status, /第二側|非零/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().features.length, n0)
  assert.equal(g().mode, 'sketch')
  assert.ok(!g().features.some((f) => f.type === 'extrude'))
})

test('runtime: after side2 refuse, legal side2=5 still applies (atomic recover)', async () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  seedSketchRect()
  useApp.setState({ extrudeExtent: 'twosides', extrudeHeight: 10, extrudeSide2: 0 })
  await g().extrudeSketch()
  assert.match(g().status, /第二側|非零/)
  g().setExtrudeSide2(5)
  assert.equal(g().extrudeSide2, 5)
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  assert.ok(g().features.some((f) => f.type === 'extrude' || f.type === 'extgroup'), g().status)
})
