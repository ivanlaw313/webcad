/**
 * CORE16 residual more20: Sweep wall negative → Formal keep-prior.
 * Desired: setSweepWall(-n) keeps prior (parity setSweepDia / setSweepScale),
 * NOT silent-clamp via Math.max(0, n||0) → 0.
 * Complements more19 core16-sweep-wall-thick-zero-refuse (which documented A but
 * stayed green). This file asserts desired Formal so A surfaces until tip fixed.
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
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')
const { illegalRejectStatus, isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /尺寸已拒绝|薄壁不可为/

test('source: setSweepWall must NOT Math.max(0,n||0); keep-prior Formal parity with Ø/scale', () => {
  const st = rd('src/store.ts')
  // Desired: (st) => ({ sweepWall: Number.isFinite(n) && n >= 0 ? n : st.sweepWall })
  // Forbidden A: Math.max(0, n || 0) silent-clamp
  assert.doesNotMatch(
    st,
    /setSweepWall:\s*\(n\)\s*=>\s*set\(\{\s*sweepWall:\s*Math\.max\(0,\s*n\s*\|\|\s*0\)\s*\}\)/,
    'A: setSweepWall still silent-clamps via Math.max(0, n||0) — desired Formal keep-prior',
  )
  assert.match(
    st,
    /setSweepWall:\s*\(n\)\s*=>\s*set\(\(st\)\s*=>/,
    'A: setSweepWall should keep-prior via set((st)=>…) like setSweepDia/setSweepScale',
  )
  // Parity references still present
  assert.match(st, /setSweepDia:\s*\(n\)\s*=>\s*set\(\(st\)\s*=>/)
  assert.match(st, /setSweepScale:\s*\(n\)\s*=>\s*set\(\(st\)\s*=>/)
})

test('runtime: setSweepWall(-3) keeps prior 2 — NOT clamp to 0', () => {
  reset()
  g().setSweepWall(2)
  assert.equal(g().sweepWall, 2)
  g().setSweepWall(-3)
  assert.equal(
    g().sweepWall,
    2,
    `A: setSweepWall(-3) must Formal keep-prior 2; got ${g().sweepWall} (silent-clamp→0 is product A)`,
  )
  assert.notEqual(g().sweepWall, 0, 'negative must not silent-clamp to 0')
})

test('runtime: setSweepWall(NaN) keeps prior; wall 0 still solid-rod OK', () => {
  reset()
  g().setSweepWall(4)
  g().setSweepWall(Number.NaN)
  assert.equal(
    g().sweepWall,
    4,
    `A: NaN must keep prior 4 (Formal); got ${g().sweepWall}`,
  )
  g().setSweepWall(0)
  assert.equal(g().sweepWall, 0, 'wall 0 = 實心圓桿 (legal)')
})

test('runtime: editFeature wall=-1 still Formal 尺寸已拒絕 (commit path independent of setter)', async () => {
  reset()
  const PIPE = {
    id: 'pipeNeg',
    type: 'sweep',
    r: 5,
    wall: 1.5,
    op: 'new',
    path: [[0, 0], [40, 0]],
  }
  assert.equal(await g().applyFeatures([PIPE], 'pipe'), true, g().status)
  const before = structuredClone(g().features)
  await g().editFeature('pipeNeg', { wall: -1 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.deepEqual(g().features, before)

  const neg = featDlgBlockingReason({ kind: 'revolve', params: { angle: 90, wall: -2 } })
  assert.equal(neg, '薄壁不可為負數')
  assert.match(illegalRejectStatus(neg), /尺寸已拒絕：薄壁不可為負數/)
})
