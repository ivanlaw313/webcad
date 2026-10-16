/**
 * CORE16 residual: Hole (孔) diameter gate.
 * Ø 0 / negative → Formal 繁中拒（尺寸已拒絕：孔徑Ø必須大於 0）; legal hole must change volume.
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
const {
  ILLEGAL_HOLE_DETAIL,
  ILLEGAL_REJECT_MARKER,
  illegalRejectStatus,
  isIllegalRejectStatus,
} = await import('../src/ui/illegalInput.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const BOX = { id: 'box', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC_REJECT = /尺寸已拒绝|孔径Ø必须|必须大于/

test('illegalInput: hole detail is Formal TC (繁中拒 marker)', () => {
  assert.equal(ILLEGAL_HOLE_DETAIL, '孔徑Ø必須大於 0')
  assert.equal(ILLEGAL_REJECT_MARKER, '尺寸已拒絕')
  const s = illegalRejectStatus(ILLEGAL_HOLE_DETAIL)
  assert.equal(s, '尺寸已拒絕：孔徑Ø必須大於 0')
  assert.equal(isIllegalRejectStatus(s), true)
  assert.doesNotMatch(s, SC_REJECT)
  assert.doesNotMatch(s, COLLOQ)
})

test('source: commitHole / Viewport pin Formal 繁中拒 for Ø≤0', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(st, /illegalRejectStatus\(ILLEGAL_HOLE_DETAIL\)/)
  assert.match(st, /!\(Number\.isFinite\(get\(\)\.holeD\) && get\(\)\.holeD > 0\)/)
  assert.match(vp, /尺寸已拒絕：孔徑Ø必須大於 0/)
  assert.doesNotMatch(vp, /尺寸已拒绝/)
  assert.doesNotMatch(st, /尺寸已拒绝：孔径/)
})

test('runtime: holeD 0 → Formal 繁中拒; features unchanged; holeMode stays open', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({
    holeMode: true,
    holePos: [20, 10, 0],
    holeFaceZ: 20,
    holeD: 0,
    holeThrough: true,
    holeType: 'simple',
  })
  await g().commitHole()
  assert.match(g().status, /尺寸已拒絕：孔徑Ø必須大於 0/)
  assert.doesNotMatch(g().status, SC_REJECT)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before)
  assert.equal(g().holeMode, true, 'mode stays open so user can fix Ø')
})

test('runtime: holeD negative → Formal 繁中拒; setHoleD does not coerce', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  useApp.setState({
    holeMode: true,
    holePos: [20, 10, 0],
    holeFaceZ: 20,
    holeD: 5,
    holeThrough: true,
    holeType: 'simple',
  })
  g().setHoleD(-2)
  assert.equal(g().holeD, -2, 'illegal Ø must not be coerced away')
  await g().commitHole()
  assert.match(g().status, /尺寸已拒絕：孔徑Ø必須大於 0/)
  assert.deepEqual(g().features, before)
  assert.equal(g().holeMode, true)
})

test('runtime: legal through hole changes volume (cuts material)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  assert.ok(Math.abs(v0 - 40 * 30 * 20) < 1, `seed vol ${v0}`)

  const hole = {
    id: 'h1',
    type: 'hole',
    kind: 'simple',
    center: [20, 15],
    top: 20,
    diameter: 8,
    through: true,
    extent: 'through-all',
  }
  assert.equal(await g().applyFeatures([BOX, hole], 'legal hole'), true, g().status)
  const v1 = await vol()
  const expectCut = Math.PI * 4 * 4 * 20
  assert.ok(v1 < v0 - expectCut * 0.5, `legal hole must reduce volume: ${v0} → ${v1}`)
  assert.ok(Math.abs(v1 - (v0 - expectCut)) < 5, `through Ø8 cut ≈ ${expectCut}, got Δ=${v0 - v1}`)
  assert.doesNotMatch(g().status, /尺寸已拒絕/)
})

test('runtime: legal commitHole via UI path also changes volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = g().bodyMesh?.volumeExact ?? (await vol())
  useApp.setState({
    holeMode: true,
    holePos: [20, 10, 0], // three-world; commit maps to CAD center
    holeFaceZ: 20,
    holeD: 6,
    holeThrough: true,
    holeType: 'simple',
    holeClearance: 0,
  })
  await g().commitHole()
  assert.equal(g().holeMode, false, `commit should close; status=${g().status}`)
  assert.ok(g().features.some((f) => f.type === 'hole'), `hole feature added; status=${g().status}`)
  const v1 = g().bodyMesh?.volumeExact ?? (await vol())
  assert.ok(v1 < v0 - 10, `UI commitHole must change volume: ${v0} → ${v1}`)
})
