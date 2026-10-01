import assert from 'node:assert/strict'
import test from 'node:test'
import { register } from 'node:module'

// The solver pulls a `?url` wasm asset that Vite resolves and Node cannot.
// Stub it exactly like the existing persistent-pattern suite does.
register('data:text/javascript,' + encodeURIComponent(
  `export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))

const { offsetPath, offsetOpenPath, offsetSampledCurve } = await import('../src/sketch/sketchOps.ts')
const { planCircularPattern, planRectPattern } = await import('../src/sketch/patternTransforms.ts')
const { createPersistentPattern, reconfigurePersistentPattern } = await import('../src/sketch/persistentPatterns.ts')
const { resolvePatternTargets, resolveSizingDistance } = await import('../src/sketch/patternSourceSelection.ts')

const bbox = (verts) => {
  const xs = verts.map((p) => p[0]), ys = verts.map((p) => p[1])
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

// ---------------------------------------------------------------------------
// BUG-207 — offset semantics.  An outward offset d must push EVERY side out by
// exactly d, so a 40x30 rectangle offset by 5 becomes 50x40 (never 58x48).
// ---------------------------------------------------------------------------

test('BUG-207 closed rectangle offset grows each side by exactly d (both windings)', () => {
  const ccw = [[0, 0], [40, 0], [40, 30], [0, 30]]
  const cw = [[0, 0], [0, 30], [40, 30], [40, 0]]
  for (const verts of [ccw, cw]) {
    const out = offsetPath(verts.map((p) => [...p]), [0, 0, 0, 0], 5)
    assert.deepEqual(bbox(out.verts).map((v) => Math.round(v * 1e6) / 1e6), [50, 40],
      'outward 5 mm on a 40x30 rectangle must be 50x40')
    const inner = offsetPath(verts.map((p) => [...p]), [0, 0, 0, 0], -5)
    assert.deepEqual(bbox(inner.verts).map((v) => Math.round(v * 1e6) / 1e6), [30, 20],
      'inward 5 mm on a 40x30 rectangle must be 30x20')
  }
})

test('BUG-207 offset is linear in d and never applies a diagonal/corner-radius term', () => {
  const verts = [[0, 0], [40, 0], [40, 30], [0, 30]]
  for (const d of [1, 2.5, 5, 9]) {
    const out = offsetPath(verts.map((p) => [...p]), [0, 0, 0, 0], d)
    const [w, h] = bbox(out.verts)
    assert.ok(near(w, 40 + 2 * d, 1e-6), `width at d=${d} must be ${40 + 2 * d}, got ${w}`)
    assert.ok(near(h, 30 + 2 * d, 1e-6), `height at d=${d} must be ${30 + 2 * d}, got ${h}`)
  }
})

test('BUG-207 rounded rectangle offset keeps arc corners and grows the envelope by d', () => {
  // 40x30 rectangle with r=5 fillets: 8 verts, quarter-circle corner bulges.
  // In this codebase a POSITIVE bulge sweeps clockwise, so a CCW outline's
  // convex corners carry negative bulges (verified: enclosed area 1178.54 =
  // 40*30 - (4-pi)*5^2).
  const q = -Math.tan(Math.PI / 8)
  const verts = [[5, 0], [35, 0], [40, 5], [40, 25], [35, 30], [5, 30], [0, 25], [0, 5]]
  const bulges = [0, q, 0, q, 0, q, 0, q]
  const out = offsetPath(verts.map((p) => [...p]), [...bulges], 5)
  const [w, h] = bbox(out.verts)
  assert.ok(near(w, 50, 1e-6), `rounded-rect outward offset width must be 50, got ${w}`)
  assert.ok(near(h, 40, 1e-6), `rounded-rect outward offset height must be 40, got ${h}`)
  assert.equal(out.bulges.filter((b) => Math.abs(b) > 1e-9).length, 4, 'all four corner arcs survive')

  const inner = offsetPath(verts.map((p) => [...p]), [...bulges], -2)
  assert.deepEqual(bbox(inner.verts).map((v) => Math.round(v * 1e6) / 1e6), [36, 26])

  // Same outline traversed the other way round: the result must be identical.
  // A winding/bulge-sign mismatch inflates the envelope (e.g. 40x30 -> ~56x45),
  // which is the shape of the BUG-207 report, so pin it explicitly.
  const n = verts.length
  const rv = [...verts].reverse()
  const rb = Array.from({ length: n }, (_, i) => -bulges[(n - 2 - i + n) % n])
  const rev = offsetPath(rv.map((p) => [...p]), rb, 5)
  assert.deepEqual(bbox(rev.verts).map((v) => Math.round(v * 1e6) / 1e6), [50, 40],
    'offset must be independent of traversal direction')
})

test('BUG-207 open polyline offset moves the chain by exactly d on both signs', () => {
  const plus = offsetOpenPath([[0, 0], [40, 0], [40, 30]], [0, 0], 5)
  const minus = offsetOpenPath([[0, 0], [40, 0], [40, 30]], [0, 0], -5)
  assert.ok(near(plus.verts[0][1], 5, 1e-9), 'left normal is exactly d away')
  assert.ok(near(minus.verts[0][1], -5, 1e-9), 'negative d mirrors the side')
  assert.equal(plus.verts.length, 3)
  assert.equal(plus.bulges.length, 2)
})

test('BUG-207 sampled closed curve offset keeps a uniform normal distance of d', () => {
  const n = 180, r = 20
  const circle = Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n
    return [r * Math.cos(a), r * Math.sin(a)]
  })
  const out = offsetSampledCurve(circle, 5, true)
  assert.ok(out, 'closed sampled offset must succeed')
  for (const p of out) {
    const rad = Math.hypot(p[0], p[1])
    assert.ok(Math.abs(rad - 25) < 0.05, `sampled offset radius must be 25, got ${rad}`)
  }
  const inner = offsetSampledCurve(circle, -5, true)
  assert.ok(inner, 'inward sampled offset must succeed')
  for (const p of inner) assert.ok(Math.abs(Math.hypot(p[0], p[1]) - 15) < 0.05)
})

// The sizing-handle rule.  Typing a distance must win over later pointer motion
// until the typed buffer is explicitly cleared; a 3 mm dead zone is not enough,
// because the confirming click is itself preceded by a pointer move.
test('BUG-207 a typed offset distance survives the pointer move that precedes the confirm click', () => {
  const typed = { typed: true, typedValue: 5 }
  assert.equal(resolveSizingDistance({ ...typed, cursorValue: 9, movedDistance: 0 }), 5)
  assert.equal(resolveSizingDistance({ ...typed, cursorValue: 9, movedDistance: 2 }), 5)
  assert.equal(resolveSizingDistance({ ...typed, cursorValue: 9, movedDistance: 40 }), 5,
    'a large pointer move must not silently replace the typed 5 mm with 9 mm')
  assert.equal(resolveSizingDistance({ typed: false, typedValue: 5, cursorValue: 9, movedDistance: 40 }), 9,
    'without a typed value the handle still tracks the cursor')
  assert.equal(resolveSizingDistance({ typed: true, typedValue: null, cursorValue: 9, movedDistance: 40 }), 9,
    'clearing the typed buffer hands control back to the cursor')
  assert.equal(resolveSizingDistance({ typed: true, typedValue: -5, cursorValue: 9, movedDistance: 40 }), -5,
    'a typed inward (negative) distance is preserved')
})

// ---------------------------------------------------------------------------
// BUG-208 — associative rectangular pattern must follow its source.
// ---------------------------------------------------------------------------

const rectDoc = () => ({
  shapes: [{ type: 'circle', c: [0, 0], r: 4 }],
  cons: [{ id: 'r0', kind: 'dim', type: 'rad', name: 'R0', a: { kind: 'circle', shape: 0 }, value: 4 }],
  entityIds: ['src0'],
  patterns: [],
})

test('BUG-208 associative rect pattern regenerates copies from the current source geometry', () => {
  const created = createPersistentPattern(rectDoc(), [0], { kind: 'rectangular', nx: 3, dx: 20, ny: 1, dy: 20 }, 'P1')
  assert.ok(created.ok, created.ok ? '' : created.reason)
  const doc = created.document
  assert.equal(doc.shapes.length, 3, '3x1 pattern = source + 2 instances')
  assert.ok(doc.shapes.slice(1).every((s) => s.r === 4), 'copies start at the source radius')

  // Change the SOURCE geometry, then regenerate: copies must follow, not stay at 4.
  const edited = { ...doc, shapes: doc.shapes.map((s, i) => (i === 0 ? { ...s, r: 9 } : s)) }
  const again = reconfigurePersistentPattern(edited, 'P1', doc.patterns[0].config)
  assert.ok(again.ok, again.ok ? '' : again.reason)
  const radii = again.document.shapes.map((s) => s.r)
  assert.deepEqual(radii, [9, 9, 9], 'every instance must adopt the new source radius')
  const xs = again.document.shapes.map((s) => s.c[0])
  assert.deepEqual(xs, [0, 20, 40], 'instance placement follows the pattern config')
})

test('BUG-208 instance identities are stable across a reconfigure (association, not re-copy)', () => {
  const created = createPersistentPattern(rectDoc(), [0], { kind: 'rectangular', nx: 3, dx: 20, ny: 1, dy: 20 }, 'P1')
  assert.ok(created.ok)
  const before = created.document.entityIds
  const again = reconfigurePersistentPattern(created.document, 'P1', { kind: 'rectangular', nx: 3, dx: 25, ny: 1, dy: 20 })
  assert.ok(again.ok, again.ok ? '' : again.reason)
  assert.deepEqual(again.document.entityIds, before, 'reconfigure keeps entity identities, so downstream refs survive')
  assert.deepEqual(again.document.shapes.map((s) => s.c[0]), [0, 25, 50])
})

// ---------------------------------------------------------------------------
// BUG-209 — a circular pattern must replicate only the SELECTED contours.
// ---------------------------------------------------------------------------

test('BUG-209 circular pattern targets resolve to the explicit selection only', () => {
  const r = resolvePatternTargets([{ shape: 1 }, { shape: 1 }, { kind: 'edge', shape: 3, idx: 0 }], 5)
  assert.ok(r.ok, r.ok ? '' : r.reason)
  assert.deepEqual(r.targets, [1, 3], 'de-duplicated, selection order preserved, nothing else included')
})

test('BUG-209 an empty selection must NOT silently fall back to every contour', () => {
  const r = resolvePatternTargets([], 6)
  assert.equal(r.ok, false, 'applying with no selection must be refused, not expanded to all 6 contours')
  const dim = resolvePatternTargets([{ kind: 'dim', id: 'd1' }], 6)
  assert.equal(dim.ok, false, 'a dimension-only selection carries no source contour')
  // Six contours stay ambiguous even when the caller opts into the lone-contour shortcut.
  assert.equal(resolvePatternTargets([], 6, { allowImplicitSingle: true }).ok, false)
  const lone = resolvePatternTargets([], 1, { allowImplicitSingle: true })
  assert.ok(lone.ok, 'a sketch with exactly one contour is unambiguous')
  assert.deepEqual(lone.targets, [0])
})

test('BUG-209 out-of-range or generated-instance selections are refused, not clamped', () => {
  assert.equal(resolvePatternTargets([{ shape: 9 }], 4).ok, false)
  assert.equal(resolvePatternTargets([{ shape: -1 }], 4).ok, false)
  assert.equal(resolvePatternTargets([{ shape: 1.5 }], 4).ok, false)
  assert.equal(resolvePatternTargets([{ shape: 2 }], 4, { generated: new Set([2]) }).ok, false,
    'a generated instance cannot become a new pattern source')
})

test('BUG-209 preview and apply derive the same instance count from one plan', () => {
  const plan = planCircularPattern(6, 360, 0, 0)
  assert.ok(plan.ok)
  assert.equal(plan.transforms.length, 5, '6 total = source + 5 copies')
  const sel = resolvePatternTargets([{ shape: 0 }], 4)
  assert.ok(sel.ok)
  // One selected contour x 5 transforms = 5 new shapes; the preview shows those 5
  // plus the untouched source = the 6 the user asked for.
  assert.equal(sel.targets.length * plan.transforms.length, 5)
  const rect = planRectPattern(3, 20, 1, 20)
  assert.ok(rect.ok)
  assert.equal(rect.transforms.length, 2)
})
