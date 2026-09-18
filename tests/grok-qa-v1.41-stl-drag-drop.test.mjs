/**
 * v1.41: STL (also .obj/.3mf) drag-and-drop onto viewport/app shell.
 * - meshDropKind / firstMeshDropFile filter without browser
 * - App + Viewport wire onDragOver/onDrop → acceptMeshDropFile
 * - acceptMeshDropFile reuses openMeshInsert / import3MF (no duplicated parsers)
 * - Chinese drop status identities under EN tStatus (no Done: regression)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { meshDropKind, firstMeshDropFile, MESH_DROP_EXTS, isFilesDrag } from '../src/io/meshDrop.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const i18nSrc = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const meshDropSrc = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.41+', () => {
  assert.match(version, /APP_VERSION = '1\.41'|APP_VERSION = '1\.[5-9]\d'|APP_VERSION = '[2-9]\./)
})

test('meshDropKind filters .stl/.obj/.3mf only', () => {
  assert.equal(meshDropKind('part.STL'), 'stl')
  assert.equal(meshDropKind('a/b/c.obj'), 'obj')
  assert.equal(meshDropKind('kit.3MF'), '3mf')
  assert.equal(meshDropKind('note.txt'), null)
  assert.equal(meshDropKind('model.step'), null)
  assert.equal(meshDropKind('noext'), null)
  assert.deepEqual([...MESH_DROP_EXTS], ['.stl', '.obj', '.3mf'])
  assert.match(meshDropSrc, /v1\.41/)
})

test('firstMeshDropFile picks first mesh; isFilesDrag checks types', () => {
  const files = [
    { name: 'readme.md' },
    { name: 'body.stl' },
    { name: 'other.obj' },
  ]
  const hit = firstMeshDropFile(files)
  assert.equal(hit?.name, 'body.stl')
  assert.equal(firstMeshDropFile([{ name: 'x.png' }]), null)
  assert.equal(firstMeshDropFile(null), null)
  assert.equal(isFilesDrag({ types: ['Files'] }), true)
  assert.equal(isFilesDrag({ types: ['text/plain'] }), false)
  assert.equal(isFilesDrag(null), false)
})

test('App shell wires mesh drop → acceptMeshDropFile', () => {
  assert.match(app, /data-mesh-drop="app"/)
  assert.match(app, /onDragOver/)
  assert.match(app, /onDrop/)
  assert.match(app, /firstMeshDropFile/)
  assert.match(app, /isFilesDrag/)
  assert.match(app, /acceptMeshDropFile\(file\)/)
})

test('Viewport wires mesh drop → acceptMeshDropFile', () => {
  assert.match(viewport, /data-mesh-drop="viewport"/)
  assert.match(viewport, /onDragOver/)
  assert.match(viewport, /firstMeshDropFile/)
  assert.match(viewport, /acceptMeshDropFile\(file\)/)
  assert.match(viewport, /from '\.\.\/io\/meshDrop'/)
})

test('acceptMeshDropFile reuses openMeshInsert / import3MF (no new parsers)', () => {
  const start = store.indexOf('acceptMeshDropFile: async')
  const end = store.indexOf('openDxfDialog: () => {')
  assert.ok(start >= 0 && end > start, 'acceptMeshDropFile block')
  const block = store.slice(start, end)
  assert.match(block, /meshDropKind/)
  assert.match(block, /openMeshInsert\('stl'/)
  assert.match(block, /openMeshInsert\('obj'/)
  assert.match(block, /import3MF/)
  assert.doesNotMatch(block, /parseStl|parseSTL|parseObj|parse3mf/)
  // openStlDialog still the chooser path for File menu / insertmesh
  assert.match(store, /openStlDialog: \(\) => \{/)
  assert.match(store, /openMeshInsert\('stl'/)
})

test('i18n X keeps mesh-drop Chinese under EN (no Done:)', () => {
  assert.match(i18nSrc, /v1\.41: mesh drag-drop/)
  assert.match(i18nSrc, /'不支持的网格拖放（请用 \.stl \/ \.obj \/ \.3mf）': '不支持的网格拖放（请用 \.stl \/ \.obj \/ \.3mf）'/)
  assert.match(i18nSrc, /'正在读取 STL「': '正在读取 STL「'/)
  assert.match(i18nSrc, /'STL 读取失败': 'STL 读取失败'/)
  // prior Chinese guards must remain
  assert.match(i18nSrc, /'已抽壳 壁厚': '已抽壳 壁厚'/)
  assert.match(i18nSrc, /'烘焙为零件实体': '烘焙为零件实体'/)
  assert.match(i18nSrc, /'已切除「': '已切除「'/)
})
