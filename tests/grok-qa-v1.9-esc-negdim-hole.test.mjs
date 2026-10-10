/**
 * v1.9 P0: BUG-UI-002 Esc feature dim editor, BUG-UI-003 reject ≤0 length dims,
 * BUG-SO18F-001 hole Ø≤0 clears stale preview (no coerce).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const sketch = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('BUG-UI-002: Esc in feature-editor fields reaches dialog cancel path', () => {
  assert.match(app, /\.feat-editor/)
  assert.match(timeline, /role="dialog"/)
  assert.match(timeline, /useEscapeLayer\(!!sel && !!meta && !commandEditing,\s*\(\) => discardFeatEdit\(\)/)
  assert.match(timeline, /skipCommit/)
  assert.match(timeline, /e\.key === 'Escape'/)
})

test('BUG-UI-003: positive length keys reject ≤0 in NumField + editFeature', () => {
  assert.match(timeline, /POSITIVE_LENGTH_KEYS/)
  assert.match(timeline, /POSITIVE_LENGTH_KEYS\.has\(fd\.key\)\s*\?\s*1e-6/)
  assert.match(storeSrc, /尺寸必須大於 0，未更改模型|ILLEGAL_LENGTH_DETAIL/)
  assert.match(storeSrc, /'a', 'b', 'c', 'diameter'/)
})

test('BUG-SO18F-001: hole Ø≤0 not coerced; preview/confirm gated', () => {
  assert.match(storeSrc, /setHoleD:\s*\(n\) => set\(\{ holeD: Number\.isFinite\(n\) \? n : 5 \}\)/)
  assert.doesNotMatch(storeSrc, /setHoleD:\s*\(n\) => set\(\{ holeD: Math\.max\(1/)
  assert.match(sketch, /!\(holeD > 0\)\) return null/)
  // Behaviour (not exact source text): evaluate the hole panel's real okDisabled expression for the gating cases —
  // numBad OR (no pick && not editing) OR Ø≤0 — so harmless refactors of the JSX don't break the pin.
  const okLine = viewport.split('\n').find((l) => /okDisabled=\{/.test(l) && /holeD/.test(l) && /holePos/.test(l))
  assert.ok(okLine, 'hole panel okDisabled expression present')
  const expr = okLine.slice(okLine.indexOf('okDisabled={') + 'okDisabled={'.length, okLine.lastIndexOf('}'))
  const vars = [...new Set(expr.match(/[A-Za-z_$][\w$]*/g))].filter((v) => !['true', 'false', 'null', 'undefined'].includes(v))
  const okDisabled = (env) => new Function(...vars, `return (${expr})`)(...vars.map((v) => env[v]))
  const base = { numBad: '', holePos: [0, 10, 0], holeEditId: null, holeD: 5 }
  assert.equal(!!okDisabled(base), false, 'valid Ø + picked position → OK enabled')
  assert.equal(!!okDisabled({ ...base, holeD: -1 }), true, 'Ø −1 → OK disabled (not coerced)')
  assert.equal(!!okDisabled({ ...base, holeD: 0 }), true, 'Ø 0 → OK disabled')
  assert.equal(!!okDisabled({ ...base, holeD: NaN }), true, 'Ø NaN → OK disabled')
  assert.equal(!!okDisabled({ ...base, holePos: null }), true, 'no position and not editing → OK disabled')
  assert.equal(!!okDisabled({ ...base, holePos: null, holeEditId: 'h1' }), false, 'editing an existing hole without re-picking → OK enabled')
  assert.equal(!!okDisabled({ ...base, holePos: null, holeEditId: 'h1', holeD: 0 }), true, 'editing with Ø 0 → OK disabled')
  assert.equal(!!okDisabled({ ...base, numBad: 'Ø' }), true, 'invalid numeric field → OK disabled')
  assert.match(viewport, /尺寸已拒絕：孔徑Ø必須大於 0|(?:孔径|孔徑) Ø (?:必须大于|必須大於) 0/)
  // LenInput keeps min gate (BUG-551); hole Ø≤0 still gated by okDisabled + preview null
  const lenAt = viewport.indexOf('function LenInput')
  const lenEnd = viewport.indexOf('// Drag-to-move triad gizmo', lenAt)
  const len = viewport.slice(lenAt, lenEnd > lenAt ? lenEnd : lenAt + 12000)
  assert.match(len, /onMm\(v\)/)
  assert.match(len, /!\(min != null && v < min\)/)
  assert.match(viewport, /BUG-SO18F-001|holeD > 0/)
})

// Runtime: editFeature rejects prim a=-1 without mutating features
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

test('BUG-UI-003 runtime: prim a=-1 rejected; solid params unchanged', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const box = { id: 'box', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new' }
  assert.equal(await g().applyFeatures([box], 'box'), true, g().status)
  const before = structuredClone(g().features)
  await g().editFeature('box', { a: -1 })
  assert.match(g().status, /(?:大于|大於) 0|尺寸/)
  assert.deepEqual(g().features, before)
  await g().editFeature('box', { a: 0 })
  assert.match(g().status, /(?:大于|大於) 0|尺寸/)
  assert.deepEqual(g().features, before)
  await g().editFeature('box', { a: 90 })
  assert.equal(g().features.find(f => f.id === 'box')?.a, 90)
})

test('BUG-SO18F-001 runtime: setHoleD(-1) kept; commitHole rejects; preview gate', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const box = { id: 'box', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, op: 'new' }
  assert.equal(await g().applyFeatures([box], 'box'), true, g().status)
  useApp.setState({ holeMode: true, holePos: [0, 10, 0], holeFaceZ: 20, holeD: 4, holeThrough: true, holeType: 'simple' })
  assert.equal(g().holeD, 4)
  g().setHoleD(-1)
  assert.equal(g().holeD, -1, 'illegal Ø must not be coerced away')
  const feats = structuredClone(g().features)
  await g().commitHole()
  assert.match(g().status, /(?:大于|大於) 0|(?:正数|正數)|(?:孔径|孔徑)/)
  assert.deepEqual(g().features, feats)
  assert.equal(g().holeMode, true)
})
