// Guard the Fusion Move/Copy parity contract that is easy to regress while editing the large viewport.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ghost = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const gizmo = readFileSync(new URL('../src/components/MoveBodyGizmo.tsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const joints = readFileSync(new URL('../src/components/JointsPanel.tsx', import.meta.url), 'utf8')
const inspector = readFileSync(new URL('../src/components/InspectorPanel.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('Move/Copy opens at Fusion-neutral zero displacement and rotation', () => {
  assert.match(store, /move:\s*\{\s*dx:\s*0,\s*dy:\s*0,\s*dz:\s*0,\s*rx:\s*0,\s*ry:\s*0,\s*rz:\s*0,[\s\S]*?angle:\s*0/)
})

test('bottom workspace panels can move or collapse instead of permanently overlapping', () => {
  assert.match(timeline, /useDraggable\('webcad-timeline', \{ right: 0, bottom: 0 \}\)/)
  assert.match(timeline, /const \[collapsed, setCollapsed\] = useState\(false\)/)
  assert.match(joints, /useDraggable\('webcad-joints', \{ right: 14, bottom: 210 \}\)/)
  assert.match(joints, /const collapsed = userCollapsed \|\| dlgOpen/)
  assert.match(joints, /\|\| inspectMode/)
  assert.match(inspector, /useDraggable\('webcad-inspector-panel', \{ right: 12, bottom: 220, zIndex: 96 \}\)/)
  assert.match(inspector, /const \[collapsed, setCollapsed\] = useState\(false\)/)
  // Advanced beam analysis must not expand a full bottom toolbar every time a body is selected.
  assert.match(viewport, /function BeamControls[\s\S]*?const \[open, setOpen\] = useState\(false\)/)
  assert.match(viewport, /if \(!open\) return <button className="sb-tool"[\s\S]*?梁分析/)
  assert.match(viewport, /onClick=\{\(\) => setOpen\(false\)\}>🔩 梁分析⌃/)
})

test('all Move Type previews reuse the submission solver', () => {
  assert.match(ghost, /import\s*\{\s*solveMove\s*\}\s*from\s*'\.\.\/cad\/moveSolve'/)
  assert.match(ghost, /const solved = solveMove\(p\)/)
})

test('solid Move/Copy exposes a live CAD-space triad', () => {
  assert.match(gizmo, /PivotControls/)
  assert.match(gizmo, /setFeatParam\('dx'/)
  assert.match(gizmo, /setFeatParam\('angle'/)
  assert.match(gizmo, /cadToThree/)
})

test('Create Copy remains a separate body and writes Fusion-style timeline entries', () => {
  assert.match(store, /type:\s*'copybody'/)
  assert.match(store, /copyMarker[\s\S]*CopyPasteBodies1/)
  assert.match(worker, /Create Copy 必须保留原实体并加一个独立实体/)
  assert.doesNotMatch(worker, /shape\s*=\s*shape\.fuse\(applyXf\(shape\.clone\(\)\)\)/)
  assert.match(timeline, /copybody:\s*\{[^}]*label:\s*'复制实体'/)
})
