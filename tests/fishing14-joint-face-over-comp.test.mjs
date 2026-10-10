// FISHING14 B: while joint / face-mate pick is armed, face picks must win over component selection —
// never open the move/rotate HUD mid-pick; Esc/cancel leaves no leftover selection HUD.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { asmFacePickArmed, faceIndexFromIntersections, resolveAsmFaceIndex } = await import('../src/assembly/jointFacePick.ts')
const g = () => useApp.getState()

test('asmFacePickArmed covers joint / face-mate / screw / hole / origin pick', () => {
  assert.equal(asmFacePickArmed({}), false)
  assert.equal(asmFacePickArmed({ jointPickMode: true }), true)
  assert.equal(asmFacePickArmed({ faceMateMode: true }), true)
  assert.equal(asmFacePickArmed({ screwFitMode: true }), true)
  assert.equal(asmFacePickArmed({ jointHolePick: 'J1' }), true)
  assert.equal(asmFacePickArmed({ jointOriginPickMode: true }), true)
})

test('faceIndexFromIntersections recovers triangle under edge-overlay steal', () => {
  const edge = { faceIndex: null, object: { isLineSegments: true, userData: {} } }
  const body = { faceIndex: 42, object: { userData: { cadBody: true, compId: 'C3' } } }
  assert.equal(faceIndexFromIntersections([edge, body], 'C3'), 42)
  assert.equal(faceIndexFromIntersections([edge, body], 'OTHER'), null)
  assert.equal(resolveAsmFaceIndex(null, [edge, body], 'C3'), 42)
  assert.equal(resolveAsmFaceIndex(7, [edge, body], 'C3'), 7)
})

test('startJointPick clears selectedComponent (no move/rotate HUD while armed)', () => {
  useApp.setState({
    ...useApp.getInitialState(), mode: 'model', lang: 'zh-HK',
    components: [{ id: 'C3', name: '組件3', mesh: { vertices: [], triangles: [], normals: [] }, pos: [0, 0, 0], rot: [0, 0, 0] }],
    selectedComponent: 'C3', selectedComponentBody: { componentId: 'C3', bodyId: 'b1' },
  }, true)
  assert.equal(g().selectedComponent, 'C3')
  g().startJointPick()
  assert.equal(g().jointPickMode, true)
  assert.equal(g().selectedComponent, null)
  assert.equal(g().selectedComponentBody, null)
  assert.match(g().status, /關節拾取/)
  assert.doesNotMatch(g().status, /[嘅咗唔喺]/)
})

test('selectComponent is refused while joint pick is armed (face must win)', () => {
  useApp.setState({
    ...useApp.getInitialState(), mode: 'model', lang: 'zh-HK',
    components: [
      { id: 'C2', name: '組件2', mesh: { vertices: [], triangles: [], normals: [] }, pos: [0, 0, 0], rot: [0, 0, 0] },
      { id: 'C3', name: '組件3', mesh: { vertices: [], triangles: [], normals: [] }, pos: [130, 0, 0], rot: [0, 0, 0] },
    ],
    jointPickMode: true, jointPick: null, selectedComponent: null,
  }, true)
  g().selectComponent('C3')
  assert.equal(g().selectedComponent, null, 'must not select component during joint pick')
  g().selectComponent(null) // clear still allowed
  assert.equal(g().selectedComponent, null)
})

test('cancelJointPick / Esc path leaves no leftover selection HUD', () => {
  useApp.setState({
    ...useApp.getInitialState(), mode: 'model', lang: 'zh-HK',
    components: [{ id: 'C3', name: '組件3', mesh: { vertices: [], triangles: [], normals: [] }, pos: [0, 0, 0], rot: [0, 0, 0] }],
    jointPickMode: true, jointPick: { compId: 'C3', face: { kind: 'cyl', axis: [0, 1, 0], p: [0, 0, 0], r: 5 } },
    selectedComponent: 'C3',
  }, true)
  g().cancelJointPick()
  assert.equal(g().jointPickMode, false)
  assert.equal(g().jointPick, null)
  assert.equal(g().selectedComponent, null)
  assert.equal(g().status, '已退出關節拾取')
})

test('pickFaceForJoint still records cylindrical face (mixed cyl↔plane path intact)', () => {
  useApp.setState({
    ...useApp.getInitialState(), mode: 'model', lang: 'zh-HK',
    components: [
      { id: 'C2', name: '組件2', mesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2], normals: [] }, pos: [0, 0, 0], rot: [0, 0, 0], grounded: true },
      { id: 'C3', name: '組件3', mesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2], normals: [] }, pos: [130, 0, 0], rot: [0, 0, 0] },
    ],
  }, true)
  g().startJointPick()
  g().pickFaceForJoint('C3', { kind: 'cyl', axis: [0, 1, 0], p: [130, 20, 0], r: 5 })
  assert.equal(g().jointPick?.compId, 'C3')
  assert.equal(g().jointPick?.face?.kind, 'cyl')
  assert.equal(g().selectedComponent, null, 'first face pick must not open component HUD')
  assert.match(g().status, /圓柱面/)
})

test('Viewport source: face-pick armed path does not require faceIndex; component select gated', () => {
  const src = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(src, /resolveAsmFaceIndex/)
  assert.match(src, /asmFacePickArmed\(st\)/)
  assert.match(src, /detectFacePreferCyl\(mesh, fi \?\? -1/)
  assert.match(src, /enabled=\{mode === 'model' && !facePickArmed\}/)
  // Must NOT require faceIndex != null for the joint/faceMate gate anymore
  assert.doesNotMatch(src, /\(faceMateMode \|\| screwFitMode \|\| jointHolePicking \|\| jointPickMode\) && e\.faceIndex != null && onFaceMatePick/)
})
