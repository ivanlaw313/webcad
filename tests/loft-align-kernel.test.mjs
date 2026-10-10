// 放樣（Loft）內核回歸：真 replicad_plus 內核 + worker 同款 src/cad/loftBuild.ts（buildLoft / 導軌 / 薄壁蓋面）。
// 覆蓋用戶報告：方→圓唔扭（側邊配對角位差≈0）、體積喺合理範圍、冇自交（BRepCheck 有效 + 每層截面積單調）、
// 3 截面、非平行截面（水平→直立 90° 拐彎）、方向相反嘅截面、重疊截面清楚繁體報錯、導軌真係移截面、薄壁真挖空。
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, drawCircle, makeBox, Plane: RPlane } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)
const L = await import('../src/cad/loftBuild.ts')
const S = await import('../src/cad/loftSections.ts')

const poly = (pts) => { let d = draw(pts[0]); for (const p of pts.slice(1)) d = d.lineTo(p); return d.close() }
const square = (h = 20) => poly([[-h, -h], [h, -h], [h, h], [-h, h]])
const squareCW = (h = 20) => poly([[-h, -h], [-h, h], [h, h], [h, -h]])
const circle = (r = 15) => drawCircle(r)
const W = (sk) => sk.wire.wrapped
const vol = (sh) => Math.abs(L.shapeVolume(OC, sh.wrapped ?? sh))

// 側邊扭轉度量：側邊 p(截面A)→q(截面B)；A 用最小旋轉對齊 B 法向後，比較 p、q 喺 B 平面內嘅角位差（°）
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const nrm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l) }
function rotMin(v, a, b) { const k = crs(a, b), s = Math.hypot(...k), c = dot(a, b); if (s < 1e-12) return c > 0 ? v : v.map((x) => -x); const ku = k.map((x) => x / s), kv = crs(ku, v), kd = dot(ku, v); return v.map((x, i) => x * c + kv[i] * s + ku[i] * kd * (1 - c)) }
function maxTwistDeg(shape, secs) {
  const on = (p, s) => Math.abs(dot(sub(p, s.c), s.n)) < 1e-3
  let m = 0, seen = 0
  for (const e of shape.edges) {
    const a = [e.startPoint.x, e.startPoint.y, e.startPoint.z], b = [e.endPoint.x, e.endPoint.y, e.endPoint.z]
    for (let i = 0; i + 1 < secs.length; i++) {
      let p = null, q = null
      if (on(a, secs[i]) && on(b, secs[i + 1])) { p = a; q = b } else if (on(b, secs[i]) && on(a, secs[i + 1])) { p = b; q = a }
      if (!p) continue
      seen++
      const vp = nrm(rotMin(sub(p, secs[i].c), secs[i].n, secs[i + 1].n)), vq = nrm(sub(q, secs[i + 1].c))
      m = Math.max(m, Math.abs(Math.atan2(dot(crs(vp, vq), secs[i + 1].n), dot(vp, vq)) * 180 / Math.PI))
    }
  }
  assert.ok(seen >= 2, 'found lateral edges between sections')
  return m
}
// 水平切片截面積（common 一塊薄板 / 厚度）
function sliceArea(shape, z, t = 0.2) {
  const slab = makeBox([-500, -500, z - t / 2], [500, 500, z + t / 2])
  return vol(shape.clone().intersect(slab)) / t
}

test('square → circle loft is untwisted, valid and its volume sits between the bounding prismoids', () => {
  for (const ruled of [true, false]) {
    const { shape } = L.buildLoft(OC, [W(square().sketchOnPlane('XY', 0)), W(circle().sketchOnPlane('XY', 60))], { ruled })
    const v = vol(shape)
    const A1 = 1600, A2 = Math.PI * 225
    const prismoid = 60 / 6 * (A1 + A2 + 4 * (A1 + A2) / 2)   // 線性插值面積
    assert.ok(v > 60 * A2 && v < 60 * A1, `volume ${v.toFixed(0)} between circle prism and square prism`)
    assert.ok(Math.abs(v - prismoid) / prismoid < 0.05, `volume ${v.toFixed(0)} ≈ prismoidal ${prismoid.toFixed(0)} (±5%)`)
    assert.ok(L.shapeIsValid(OC, shape.wrapped), 'BRepCheck valid (no self-intersection)')
    assert.ok(maxTwistDeg(shape, [{ c: [0, 0, 0], n: [0, 0, 1] }, { c: [0, 0, 60], n: [0, 0, 1] }]) < 3, 'corners map to the nearest circle points (no twist)')
    // 冇沙漏收腰：每層截面積由 1600 單調跌到 706
    const areas = [6, 18, 30, 42, 54].map((z) => sliceArea(shape, z))
    for (let i = 1; i < areas.length; i++) assert.ok(areas[i] < areas[i - 1] + 1e-6, `area monotonic ${areas.map((a) => a.toFixed(0)).join('→')}`)
    assert.ok(areas[2] > 900, `mid section ${areas[2].toFixed(0)} is not pinched`)
  }
})

test('opposite winding / flipped sketch normal / rotated seam still loft untwisted with the same volume', () => {
  const ref = vol(L.buildLoft(OC, [W(square().sketchOnPlane('XY', 0)), W(circle().sketchOnPlane('XY', 60))], {}).shape)
  const r = L.buildLoft(OC, [W(squareCW().sketchOnPlane('XY', 0)), W(circle().sketchOnPlane(new RPlane([0, 0, 60], [-0.6, -0.8, 0], [0, 0, -1])))], {})
  assert.ok(r.reversed.some(Boolean), 'one section was re-oriented to the loft direction')
  assert.ok(Math.abs(vol(r.shape) - ref) / ref < 0.01, `volume ${vol(r.shape).toFixed(0)} ≈ ${ref.toFixed(0)}`)
  assert.ok(maxTwistDeg(r.shape, [{ c: [0, 0, 0], n: [0, 0, 1] }, { c: [0, 0, 60], n: [0, 0, 1] }]) < 3)
})

test('3 sections (square → circle → square) loft through all of them', () => {
  for (const ruled of [true, false]) {
    const ws = [W(square().sketchOnPlane('XY', 0)), W(circle(12).sketchOnPlane('XY', 40)), W(squareCW().sketchOnPlane('XY', 80))]
    const { shape } = L.buildLoft(OC, ws, { ruled })
    const v = vol(shape)
    assert.ok(L.shapeIsValid(OC, shape.wrapped))
    assert.ok(v > 80 * Math.PI * 144 && v < 80 * 1600, `volume ${v.toFixed(0)} in range`)
    const bb = shape.boundingBox.bounds
    assert.ok(Math.abs(bb[0][2]) < 1e-6 && Math.abs(bb[1][2] - 80) < 1e-6, 'spans all 3 sections')
    assert.ok(sliceArea(shape, 40) < 1600 * 0.7, 'waist passes through the middle circle')
  }
})

test('sections on non-parallel planes (horizontal square → vertical circle) loft as a valid bend', () => {
  const secs = [{ c: [0, 0, 0], n: [0, 0, 1] }, { c: [50, 0, 60], n: [1, 0, 0] }]
  for (const n of [[1, 0, 0], [-1, 0, 0]]) {
    const { shape } = L.buildLoft(OC, [W(square().sketchOnPlane('XY', 0)), W(circle().sketchOnPlane(new RPlane([50, 0, 60], [0, 1, 0], n)))], { ruled: true })
    assert.ok(L.shapeIsValid(OC, shape.wrapped))
    assert.ok(vol(shape) > 30000 && vol(shape) < 120000, `bend volume ${vol(shape).toFixed(0)}`)
    assert.ok(maxTwistDeg(shape, secs) < 3, 'bend is untwisted regardless of the vertical sketch normal')
  }
})

test('coincident sections and too few sections fail with a clear Traditional reason', () => {
  assert.throws(() => L.buildLoft(OC, [W(square().sketchOnPlane('XY', 0)), W(circle().sketchOnPlane('XY', 0))], {}), /放樣失敗：第 1 與第 2 個截面在同一位置/)
  assert.throws(() => L.buildLoft(OC, [W(square().sketchOnPlane('XY', 0))], {}), /放樣失敗：至少要 2 個截面/)
})

test('rail (guide) really moves sections, for any section orientation', () => {
  const loops = [L.sampleWirePts(OC, W(square().sketchOnPlane('XY', 0)), 96), L.sampleWirePts(OC, W(circle().sketchOnPlane('XY', 60)), 96)]
  const offs = L.railFollowOffsets(loops, [[20, 0], [35, 0]])
  assert.ok(Math.abs(offs[0][0]) < 0.5 && Math.abs(offs[1][0] - 20) < 0.5, `offsets ${JSON.stringify(offs)}`)
  const ws = [W(square().sketchOnPlane('XY', 0)), L.translateWire(OC, W(circle().sketchOnPlane('XY', 60)), offs[1])]
  const { shape } = L.buildLoft(OC, ws, {})
  const bb = shape.boundingBox.bounds
  assert.ok(Math.abs(bb[1][0] - 35) < 0.5, `top circle now touches rail x=35 (bbox max x ${bb[1][0].toFixed(2)})`)
})

test('thin wall opens an end-cap face without assuming XY planes (incl. a vertical end section)', () => {
  const shellEither = (r) => { for (const cap of [r.last, r.first]) { try { return r.shape.shell(-2, L.capFaceFinder(cap)) } catch { /* 下一個端蓋 */ } } return null }
  for (const ws of [
    [W(square().sketchOnPlane('XY', 0)), W(circle().sketchOnPlane('XY', 60))],
    [W(square().sketchOnPlane('XY', 0)), W(circle().sketchOnPlane(new RPlane([50, 0, 60], [0, 1, 0], [1, 0, 0])))],
  ]) {
    const r = L.buildLoft(OC, ws, {})
    const solid = vol(r.shape)
    const sh = shellEither(r)
    assert.ok(sh, 'one of the end caps can be opened')
    const v = vol(sh)
    assert.ok(v > 1000 && v < solid * 0.6, `shelled ${v.toFixed(0)} < solid ${solid.toFixed(0)}`)
  }
})

test('cap point (loft to point) closes into a cone-like solid', () => {
  const r = L.buildLoft(OC, [W(square().sketchOnPlane('XY', 0))], { capPoint: [0, 0, 50] })
  const v = vol(r.shape)
  assert.ok(Math.abs(v - 1600 * 50 / 3) / (1600 * 50 / 3) < 0.02, `pyramid volume ${v.toFixed(0)}`)
})

test('planar face loop → arbitrary-plane loft section maps back onto the face', () => {
  const sec = S.faceLoopToSection({ loop: [[10, 0, 0], [10, 20, 0], [10, 20, 30], [10, 0, 30]], normal: [1, 0, 0], center: [10, 10, 15] })
  assert.equal(sec.profile.kind, 'poly')
  const pl = new RPlane(sec.arbPlane.o, sec.arbPlane.xd, sec.arbPlane.n)
  const sk = poly(sec.profile.pts).sketchOnPlane(pl)
  const pts = L.sampleWirePts(OC, sk.wire.wrapped, 16)
  for (const p of pts) assert.ok(Math.abs(p[0] - 10) < 1e-6 && p[1] > -1e-6 && p[1] < 20 + 1e-6 && p[2] > -1e-6 && p[2] < 30 + 1e-6, `point ${p} on face`)
})

test('section order: same plane sorts by offset until the user reorders; mixed planes keep pick order', () => {
  const secs = [{ z: 60 }, { z: 0 }, { z: 30 }]
  assert.deepEqual(S.loftEffectiveOrder(secs, false), [1, 2, 0])
  assert.deepEqual(S.loftEffectiveOrder(secs, true), [0, 1, 2])
  assert.deepEqual(S.loftMoveOrder(secs, false, 0, 1), [2, 1, 0])
  assert.deepEqual(S.loftEffectiveOrder([{ z: 60 }, { z: 0, plane: 'XZ' }], false), [0, 1])
})
