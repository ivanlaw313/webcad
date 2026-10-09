// RETEST18 #4：XY 草圖光標讀 (10,5) 但孔落喺世界 Y≈−5。
// 根因：草圖局部 t = three Z = −CAD Y；孔（holePoints）同拉伸（stToProfile）都正確映射到 CAD，但狀態列 ⌖ 讀數同
// 「已落草圖點 (x, y)」直接顯示局部 [s,t] → Y 反號。修正：讀數 / 狀態一律經 planeCoords 報平面 CAD 座標；
// 孔、拉伸、讀數三者共用同一個映射。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sketchLocalToPlane, planeToSketchLocal, sketchCursorReadout } from '../src/sketch/planeCoords.ts'
import { sketchPointsOf } from '../src/sketch/holePoints.ts'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

// SketchLayer XY：toST(p) = [p.x, p.z]（three）；CAD = (x, −z_three)
const localOfCad = (x, y) => [x, -y]

test('one mapping for readout, hole points and extrude profile (XY / XZ / YZ round-trip)', () => {
  const loc = localOfCad(10, 5)                       // user hovers CAD (10, 5)
  assert.deepEqual(sketchCursorReadout(loc, 'XY', false), [10, 5], 'readout shows CAD (10,5), not (10,-5)')
  assert.deepEqual(sketchPointsOf([{ type: 'circle', c: loc, r: 0, point: true }]), [[10, 5]], 'hole point → CAD (10,5)')
  assert.deepEqual(sketchLocalToPlane(loc, 'XY'), [10, 5], 'extrude profile (stToProfile) → CAD (10,5)')
  for (const pl of ['XY', 'XZ', 'YZ']) assert.deepEqual(planeToSketchLocal(sketchLocalToPlane([3, -7], pl), pl), [3, -7])
  assert.deepEqual(sketchCursorReadout([4, 6], 'XY', true), [4, 6], 'arb plane keeps local coordinates')
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(store, /const stToProfile = \(p: Pt, plane: Plane\): \[number, number\] => sketchLocalToPlane\(p, plane\)/)
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /sketchCursorReadout\(sketchPreview, sketchPlane, !!sketchArb\)/)
  assert.doesNotMatch(vp, /⌖ \{sketchPreview\[0\]\.toFixed\(1\)\}/)
})

test('point tool status reports CAD plane coordinates', async () => {
  useApp.setState({ mode: 'sketch', sketchPlane: 'XY', sketchArb: null, sketchTool: 'point', sketchProfiles: [], sketchShape: null })
  const s = g()
  const click = s.onSketchClick ?? s.sketchClick
  assert.equal(typeof click, 'function')
  await click(localOfCad(10, 5))
  assert.match(g().status, /已落草圖點 \(10\.0, 5\.0\)/, g().status)
  assert.deepEqual(g().sketchProfiles.at(-1).c, [10, -5], 'stored sketch-local point unchanged (t = −Y)')
})

test('end-to-end: hole from a sketch point at CAD (10,5) is drilled at world Y = +5 (not −5)', async () => {
  const plate = { id: 'base', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 12, operation: 'new' }
  useApp.setState({ mode: 'model', sketchProfiles: [], sketchShape: null, holeType: 'simple', holeD: 4, holeClearance: 0, holeThrough: true, holeSlot: false, holeTapModeled: false, holeToNext: false, holeToObject: false })
  assert.equal(await g().applyFeatures([plate, { id: 'skf', type: 'sketch', sketchId: 'sk1' }], 'plate'), true)
  useApp.setState({ sketchSources: { sk1: { shapes: [{ type: 'circle', c: localOfCad(10, 5), r: 0, point: true, construction: true }], plane: 'XY', visible: true, name: '孔位' } } })
  await g().addHolesAtSketchPoints('sk1')
  const hole = g().features.find((f) => f.type === 'hole')
  assert.ok(hole, g().status)
  assert.deepEqual(hole.center.map((v) => +v.toFixed(3)), [10, 5])
  assert.match(g().status, /@ \(10,5\)/)
  // bodyMesh is CAD: the hole wall vertices sit on a Ø4 circle about (10, +5)
  const V = g().bodyMesh.vertices
  let onWallPos = 0, onWallNeg = 0
  for (let i = 0; i < V.length; i += 3) {
    if (Math.abs(Math.hypot(V[i] - 10, V[i + 1] - 5) - 2) < 0.05) onWallPos++
    if (Math.abs(Math.hypot(V[i] - 10, V[i + 1] + 5) - 2) < 0.05) onWallNeg++
  }
  assert.ok(onWallPos > 8, `hole wall at (10,+5): ${onWallPos}`)
  assert.equal(onWallNeg, 0, 'nothing drilled at the mirrored (10,−5)')
})
