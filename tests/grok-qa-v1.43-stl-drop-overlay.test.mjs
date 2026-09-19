/**
 * v1.43 BUG-BD-4101: STL drag-drop must work on LIVE viewport canvas.
 * - document-level capture host (meshDropHost) + viewport overlay above WebGL canvas
 * - filesFromDataTransfer reads items.getAsFile when FileList empty
 * - empty drop surfaces Chinese status (never silent no-op)
 * - shouldAllowMeshDragOver accepts uri-list / plain / empty-types automation
 * - Keeps acceptMeshDropFile → openMeshInsert / import3MF
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
  resolveMeshDropFromDataTransfer,
  filesFromDataTransfer,
  MESH_DROP_EXTS,
  MESH_DROP_EMPTY_STATUS,
  MESH_DROP_ARMED_STATUS,
  shouldAcceptMeshDropNow,
  resetMeshDropDedupe,
} from '../src/io/meshDrop.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const host = readFileSync(new URL('../src/io/meshDropHost.ts', import.meta.url), 'utf8')
const i18nSrc = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const meshDropSrc = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.43+', () => {
  assert.match(version, /APP_VERSION = '1\.43'|APP_VERSION = '1\.(4[4-9]|[5-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('meshDropKind / MESH_DROP_EXTS unchanged', () => {
  assert.equal(meshDropKind('cube_20mm.stl'), 'stl')
  assert.equal(meshDropKind('a.OBJ'), 'obj')
  assert.equal(meshDropKind('x.3mf'), '3mf')
  assert.equal(meshDropKind('note.txt'), null)
  assert.deepEqual([...MESH_DROP_EXTS], ['.stl', '.obj', '.3mf'])
  assert.match(meshDropSrc, /v1\.43/)
})

test('shouldAllowMeshDragOver accepts Files + empty-types + uri-list automation', () => {
  assert.equal(shouldAllowMeshDragOver({ types: ['Files'], effectAllowed: 'all' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: ['application/x-moz-file'], effectAllowed: 'copy' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: [], effectAllowed: 'all' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: [], effectAllowed: 'uninitialized' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: ['text/uri-list'], effectAllowed: 'copy' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: ['text/plain'], effectAllowed: 'all' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: ['text/plain', 'text/html'], effectAllowed: 'copy' }), false)
  assert.equal(shouldAllowMeshDragOver({ types: ['application/octet-stream'], effectAllowed: 'copy' }), true)
  assert.equal(shouldAllowMeshDragOver({ types: ['text/html'], effectAllowed: 'copy' }), false)
  assert.equal(shouldAllowMeshDragOver(null), false)
  assert.equal(isFilesDrag({ types: ['Files'] }), true)
})

test('filesFromDataTransfer prefers files; falls back to items.getAsFile', () => {
  const real = [{ name: 'a.stl', size: 10 }]
  assert.equal(filesFromDataTransfer({ files: real, items: [] })[0]?.name, 'a.stl')
  // items-only path (automation)
  const fakeItem = { kind: 'file', getAsFile: () => ({ name: 'via-item.stl', size: 3 }) }
  const viaItems = filesFromDataTransfer({ files: [], items: [fakeItem], types: ['Files'] })
  assert.equal(viaItems[0]?.name, 'via-item.stl')
  assert.equal(resolveMeshDropFromDataTransfer({ files: [], items: [fakeItem] })?.name, 'via-item.stl')
  assert.equal(resolveMeshDropFile([{ name: 'a.txt' }, { name: 'b.stl' }])?.name, 'b.stl')
  assert.equal(firstMeshDropFile([{ name: 'a.txt' }]), null)
})

test('empty-drop + armed status strings exported', () => {
  assert.match(MESH_DROP_EMPTY_STATUS, /未能读取拖放文件/)
  assert.match(MESH_DROP_ARMED_STATUS, /放開以匯入網格|松开以导入网格/)
})

test('drop dedupe suppresses double accept within 800ms', () => {
  resetMeshDropDedupe()
  const f = { name: 'cube_20mm.stl', size: 1511, lastModified: 1 }
  assert.equal(shouldAcceptMeshDropNow(f, 1000), true)
  assert.equal(shouldAcceptMeshDropNow(f, 1100), false)
  assert.equal(shouldAcceptMeshDropNow(f, 2000), true)
})

test('meshDropHost: document capture + overlay arming (BUG-BD-4101)', () => {
  assert.match(host, /ensureMeshDropHost/)
  assert.match(host, /setMeshDropOverlay/)
  assert.match(host, /addEventListener\('dragover'/)
  assert.match(host, /capture:\s*true/)
  assert.match(host, /MESH_DROP_EMPTY_STATUS/)
  assert.match(host, /dropEffect = 'copy'/)
  assert.match(viewport, /data-mesh-drop-overlay="1"/)
  assert.match(viewport, /meshDropOverlayRef/)
  assert.match(viewport, /setMeshDropOverlay/)
  assert.match(viewport, /ensureMeshDropHost/)
  assert.match(viewport, /BUG-BD-4101/)
})

test('App wires document mesh drop host', () => {
  assert.match(app, /ensureMeshDropHost/)
  assert.match(app, /data-mesh-drop="app"/)
  assert.match(app, /data-mesh-drop-doc="1"/)
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

test('i18n keeps mesh-drop Chinese + v1.43 empty/armed', () => {
  assert.match(i18nSrc, /'不支持的网格拖放（请用 \.stl \/ \.obj \/ \.3mf）': '不支持的网格拖放（请用 \.stl \/ \.obj \/ \.3mf）'/)
  assert.match(i18nSrc, /'正在读取 STL「': '正在读取 STL「'/)
  assert.match(i18nSrc, /未能读取拖放文件/)
  assert.match(i18nSrc, /放開以匯入網格|松开以导入网格/)
  assert.match(i18nSrc, /'已抽殼 壁厚': '已抽殼 壁厚'/)
  assert.match(i18nSrc, /'已抽壳 壁厚': '已抽壳 壁厚'/ )
  assert.match(i18nSrc, /'烘焙為零件實體': '烘焙為零件實體'/)
  assert.match(i18nSrc, /'烘焙为零件实体': '烘焙为零件实体'/ )
  assert.match(i18nSrc, /'已切除「': '已切除「'/)
})
