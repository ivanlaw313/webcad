/**
 * v1.42 BUG-BD-4101: STL drag-drop must not be swallowed by WebGL <canvas>.
 * - shouldAllowMeshDragOver preventDefaults even when types lack Files (automation)
 * - Viewport + App use capture-phase listeners (data-mesh-drop-capture)
 * - resolveMeshDropFile falls back to first file → acceptMeshDropFile shows 不支持…
 * - Keeps v1.41 openMeshInsert / import3MF reuse + Chinese identities
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  meshDropKind,
  firstMeshDropFile,
  isFilesDrag,
  shouldAllowMeshDragOver,
  resolveMeshDropFile,
  MESH_DROP_EXTS,
} from '../src/io/meshDrop.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const i18nSrc = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const meshDropSrc = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.42+', () => {
  assert.match(version, /APP_VERSION = '1\.42'|APP_VERSION = '1\.(4[3-9]|[5-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('meshDropKind / MESH_DROP_EXTS unchanged', () => {
  assert.equal(meshDropKind('cube_20mm.stl'), 'stl')
  assert.equal(meshDropKind('a.OBJ'), 'obj')
  assert.equal(meshDropKind('x.3mf'), '3mf')
  assert.equal(meshDropKind('note.txt'), null)
  assert.deepEqual([...MESH_DROP_EXTS], ['.stl', '.obj', '.3mf'])
  assert.match(meshDropSrc, /v1\.42/)
})

test('shouldAllowMeshDragOver accepts Files + empty-types automation drags', () => {
  assert.equal(shouldAllowMeshDragOver({ types: ['Files'], effectAllowed: 'all' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: ['application/x-moz-file'], effectAllowed: 'copy' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: [], effectAllowed: 'all' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: [], effectAllowed: 'uninitialized' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: [], effectAllowed: 'copy' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: ['text/plain'], effectAllowed: 'copy' }), true) // v1.43: plain-only OK; plain+html still rejected
  assert.equal(shouldAllowMeshDragOver({ types: ['text/plain', 'text/html'], effectAllowed: 'copy' }), false)
  assert.equal(shouldAllowMeshDragOver(null), false)
  assert.equal(isFilesDrag({ types: ['Files'] }), true)
  assert.equal(isFilesDrag({ types: [] }), false)
})

test('resolveMeshDropFile prefers mesh; falls back to first file for visible reject', () => {
  assert.equal(resolveMeshDropFile([{ name: 'a.txt' }, { name: 'b.stl' }])?.name, 'b.stl')
  assert.equal(resolveMeshDropFile([{ name: 'a.txt' }])?.name, 'a.txt')
  assert.equal(resolveMeshDropFile([]), null)
  assert.equal(resolveMeshDropFile(null), null)
  assert.equal(firstMeshDropFile([{ name: 'a.txt' }]), null)
})

test('Viewport wires capture-phase mesh drop (BUG-BD-4101)', () => {
  assert.match(viewport, /data-mesh-drop="viewport"/)
  assert.match(viewport, /data-mesh-drop-capture="1"/)
  assert.match(viewport, /viewportDropRef/)
  // v1.43: document host + overlay (replaces per-element addEventListener)
  assert.match(viewport, /ensureMeshDropHost|addEventListener\('dragover'/)
  assert.match(viewport, /acceptMeshDropFile|setMeshDropOverlay/)
  assert.match(viewport, /BUG-BD-4101/)
})

test('App shell wires capture-phase mesh drop', () => {
  assert.match(app, /data-mesh-drop="app"/)
  assert.match(app, /data-mesh-drop-capture="1"/)
  assert.match(app, /appDropRef/)
  assert.match(app, /ensureMeshDropHost/)
  assert.match(app, /acceptMeshDropFile/)
})

test('acceptMeshDropFile still reuses openMeshInsert / import3MF', () => {
  const start = store.indexOf('acceptMeshDropFile: async')
  const end = store.indexOf('openDxfDialog: () => {')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /openMeshInsert\('stl'/)
  assert.match(block, /openMeshInsert\('obj'/)
  assert.match(block, /import3MF/)
  assert.doesNotMatch(block, /parseStl|parseSTL|parseObj|parse3mf/)
  assert.match(block, /不支持的网格拖放/)
})

test('i18n keeps mesh-drop Chinese + prior guards', () => {
  assert.match(i18nSrc, /'不支持的网格拖放（请用 \.stl \/ \.obj \/ \.3mf）': '不支持的网格拖放（请用 \.stl \/ \.obj \/ \.3mf）'/)
  assert.match(i18nSrc, /'正在读取 STL「': '正在读取 STL「'/)
  assert.match(i18nSrc, /'已抽壳 壁厚': '已抽壳 壁厚'/)
  assert.match(i18nSrc, /'烘焙为零件实体': '烘焙为零件实体'/)
  assert.match(i18nSrc, /'已切除「': '已切除「'/)
})
