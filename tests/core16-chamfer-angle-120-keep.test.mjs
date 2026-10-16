/**
 * CORE16 residual more16: chamfer「距離＋角度」type 120° —
 * keep original typed value (BUG-409 / angle-keep) + red Formal alert (ok disabled).
 * Extends p1-chamfer-angle-keep / p2-chamfer-typekeep without pure duplicate:
 * runtime commit refuse, Viewport red #b42318 wiring, typekeep picks across mode.
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
const { useApp, chamferInputReason } = await import('../src/store.ts')
const { illegalRejectStatus, isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /角度必须|尺寸已拒绝|大于 0/
const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 40, c: 40, op: 'new', cornerOrigin: true }
const TOP_FRONT = [[20, 40, 0]]

test('CORE16 more16: setChamferAngle(120) keeps 120; reason Formal TC; illegalRejectStatus wraps', () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK' }, true)
  g().setChamferAngle(120)
  assert.equal(g().chamferAngle, 120, 'typed 120 must stay in store (no silent clamp to 90)')
  const box = { vertices: [0, 0, 0, 40, 30, 10] }
  const reason = chamferInputReason({
    edgeRoundSize: 2,
    chamferMode: 'angle',
    chamferAngle: 120,
    bodyMesh: box,
  })
  assert.match(reason || '', /角度必須大於 0° 以及小於 90°/)
  assert.doesNotMatch(reason || '', COLLOQ)
  assert.doesNotMatch(reason || '', SC)
  const wrapped = illegalRejectStatus(reason)
  assert.equal(isIllegalRejectStatus(wrapped), true)
  assert.match(wrapped, /^尺寸已拒絕：/)
  // legal 45 clears
  assert.equal(
    chamferInputReason({ edgeRoundSize: 2, chamferMode: 'angle', chamferAngle: 45, bodyMesh: box }),
    null,
  )
})

test('source: Viewport red alert + okDisabled + NumInput no max={90} (angle-keep + red)', () => {
  const vp = rd('src/components/Viewport.tsx')
  const st = rd('src/store.ts')
  assert.match(vp, /data-testid="chamfer-illegal-alert"/)
  assert.match(vp, /color: '#b42318'/)
  assert.match(vp, /chamferBad && \(edgeRoundPicks\.length > 0 \|\| \/\^尺寸已拒絕/)
  assert.match(vp, /!!chamferBad/)
  assert.match(vp, /chamferMode === 'angle' && \(!chamferRefFace \|\| !\(chamferAngle > 0 && chamferAngle < 90\)\)/)
  const m = vp.match(/NumInput value=\{chamferAngle\}[^>]*>/)
  assert.ok(m, 'chamferAngle NumInput')
  assert.doesNotMatch(m[0], /max=\{90\}/)
  assert.match(m[0], /onValue=\{setChamferAngle\}/)
  // setChamferAngle keeps finite n as-is (angle-keep)
  const start = st.indexOf('setChamferAngle: (n) =>')
  assert.ok(start > 0)
  const block = st.slice(start, st.indexOf('\n  setChamferReferenceFace:', start))
  assert.doesNotMatch(block, /Math\.min\(90/)
  assert.match(block, /Number\.isFinite\(n\)\s*\?\s*n\s*:\s*45/)
})

test('runtime: commitEdgeRound angle=120 refuses; keeps 120; no chamfer feature (typekeep picks)', async () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const n0 = g().features.length
  useApp.setState({
    edgeRoundPick: 'chamfer',
    edgeRoundPicks: TOP_FRONT,
    edgeRoundPickLines: [[[0, 0, 0], [1, 0, 0]]],
    edgeRoundRadii: [2],
    edgeRoundGroupIds: [0],
    edgeRoundSize: 2,
    chamferMode: 'angle',
    chamferSize2: 0,
    chamferAngle: 120,
    chamferFlip: false,
    chamferRefFace: { p: [0, 0, 1], faceId: 1 },
  })
  assert.equal(g().chamferAngle, 120)
  assert.equal(g().edgeRoundPicks.length, 1, 'typekeep: picks present before refuse')
  await g().commitEdgeRound()
  assert.match(g().status, /角度必須大於 0° 以及小於 90°/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().chamferAngle, 120, 'refuse must not rewrite typed 120')
  assert.equal(g().features.length, n0)
  assert.equal(g().features.some((f) => f.type === 'chamfer'), false)
  assert.equal(g().edgeRoundPick, 'chamfer', 'stay in chamfer so user can fix angle')
  assert.equal(g().edgeRoundPicks.length, 1, 'typekeep: picks survive refuse')
  // Fix to legal 45 and confirm path is not permanently broken (smoke — may still need valid ref face geo)
  g().setChamferAngle(45)
  assert.equal(g().chamferAngle, 45)
  assert.equal(
    chamferInputReason({
      edgeRoundSize: 2,
      chamferMode: 'angle',
      chamferAngle: 45,
      bodyMesh: { vertices: [0, 0, 0, 40, 40, 40] },
    }),
    null,
  )
})
