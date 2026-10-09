// RETEST21 #3：關節卡「✕」刪除冇確認 → Fusion 做法：刪除可撤銷。一下 ✕ = 一步撤銷快照；Ctrl+Z（undo）還原關節同佢嘅運動連接，
// redo 再刪；狀態列講明「Ctrl+Z 可還原」。真瀏覽器：scripts/e2e-joint-ui.mjs（撳卡上 ✕ → Ctrl+Z）。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const mesh = () => ({ vertices: new Float32Array([0, 0, 0, 10, 0, 0, 0, 10, 0]), indices: new Uint32Array([0, 1, 2]), normals: new Float32Array(9) })
const comp = (id) => ({ id, name: id, mesh: mesh(), pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' })

test('✕ delete is one undo step; undo restores joint + motion link (same angle); redo deletes again', async () => {
  useApp.setState({ components: [comp('P'), comp('S'), comp('T')], undoStack: [], redoStack: [], mode: 'model', grounded: null,
    joints: [{ id: 'J1', name: '關節1', type: 'revolute', parent: 'P', child: 'S', anchor: [0, 0, 0], axis: [0, 1, 0], angle: 37, slide: 0 },
      { id: 'J2', name: '關節2', type: 'revolute', parent: 'P', child: 'T', anchor: [20, 0, 0], axis: [0, 1, 0], angle: 0, slide: 0 }],
    motionLinks: [{ id: 'L1', driver: 'J1', driven: 'J2', ratio: -1 }] })
  g().removeJoint('J1')
  assert.deepEqual(g().joints.map((j) => j.id), ['J2'])
  assert.equal(g().motionLinks.length, 0)
  assert.equal(g().undoStack.length, 1)
  assert.match(g().status, /已刪除關節「關節1」（連同 1 條運動連接） — Ctrl\+Z 可還原/)
  await g().undo()
  assert.deepEqual(g().joints.map((j) => j.id).sort(), ['J1', 'J2'])
  assert.equal(g().joints.find((j) => j.id === 'J1').angle, 37)
  assert.equal(g().motionLinks.length, 1)
  await g().redo()
  assert.deepEqual(g().joints.map((j) => j.id), ['J2'])
  g().removeJoint('nope'); assert.equal(g().undoStack.length, 1, 'unknown id → no snapshot')
})

test('joint card ✕ calls removeJoint directly (no blocking confirm) and is testable', () => {
  const jp = readFileSync(new URL('../src/components/JointsPanel.tsx', import.meta.url), 'utf8')
  assert.match(jp, /data-testid=\{'joint-card-del-' \+ j\.id\} title="刪除關節（Ctrl\+Z 可還原）" onClick=\{\(\) => removeJoint\(j\.id\)\}/)
})

test('joints pill expands on click even while the (default-on) inspector is active; only command dialogs force the yield', () => {
  const src = readFileSync(new URL('../src/components/JointsPanel.tsx', import.meta.url), 'utf8')
  assert.match(src, /const collapsed = userCollapsed \|\| dlgOpen \|\| \(inspectMode && !userExpanded\)/)
  assert.doesNotMatch(src, /s\.loftDlgOpen\)\) \|\| inspectMode/)
  assert.match(src, /if \(!dlgOpen\) \{ setUserCollapsed\(false\); setUserExpanded\(true\) \}/)
})
