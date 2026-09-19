/**
 * v1.44: MESH File→导入 / insertmesh chooser status parity with drag-drop + MESH tab hint.
 * - openStlDialog / openObjDialog / open3MFDialog show 正在读取 …「name」… before insert/import
 * - setActiveTab('MESH') surfaces MESH_TAB_DROP_HINT when idle
 * - Does not regress v1.40 cancel / v1.41–1.43 drag-drop
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MESH_TAB_DROP_HINT, MESH_DROP_ARMED_STATUS } from '../src/io/meshDrop.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const i18nSrc = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const meshDropSrc = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.44+', () => {
  assert.match(version, /APP_VERSION = '1\.44'|APP_VERSION = '1\.(4[5-9]|[5-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('MESH_TAB_DROP_HINT exported and Chinese', () => {
  assert.match(MESH_TAB_DROP_HINT, /拖到视口导入/)
  assert.match(MESH_TAB_DROP_HINT, /\.stl/)
  assert.match(meshDropSrc, /v1\.44/)
  assert.match(MESH_DROP_ARMED_STATUS, /放開以匯入網格|松开以导入网格/)
})

test('setActiveTab(MESH) sets MESH_TAB_DROP_HINT when idle', () => {
  const start = store.indexOf('setActiveTab: (t) => {')
  assert.ok(start >= 0)
  const block = store.slice(start, start + 450)
  assert.match(block, /MESH_TAB_DROP_HINT/)
  assert.match(block, /t === 'MESH'/)
  assert.match(block, /!get\(\)\.busy/)
  assert.match(block, /!get\(\)\.insertMesh/)
  assert.match(store, /import \{ meshDropKind, MESH_TAB_DROP_HINT \}/)
})

test('openStlDialog success path has 正在读取 STL parity (v1.44)', () => {
  const start = store.indexOf('openStlDialog: () => {')
  const end = store.indexOf('acceptMeshDropFile: async')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /v1\.44/)
  assert.match(block, /正在读取 STL「\$\{f\.name\}」…/)
  assert.match(block, /STL 读取失败/)
  assert.match(block, /openMeshInsert\('stl'/)
  assert.match(block, /已取消选择 STL/)
  assert.match(block, /BUG-BD-3901|BUG-BD-1804/)
})

test('openObjDialog / open3MFDialog chooser parity', () => {
  const objStart = store.indexOf('openObjDialog: () => {')
  const objEnd = store.indexOf('insertMesh: null,')
  assert.ok(objStart >= 0 && objEnd > objStart)
  const obj = store.slice(objStart, objEnd)
  assert.match(obj, /正在读取 OBJ「\$\{f\.name\}」…/)
  assert.match(obj, /OBJ 读取失败/)
  assert.match(obj, /选择 OBJ 文件…/)
  assert.match(obj, /openMeshInsert\('obj'/)

  const m3Start = store.indexOf('open3MFDialog: () => {')
  const m3End = store.indexOf('openStepComponentDialog: () => {')
  assert.ok(m3Start >= 0 && m3End > m3Start)
  const m3 = store.slice(m3Start, m3End)
  assert.match(m3, /正在读取 3MF「\$\{f\.name\}」…/)
  assert.match(m3, /3MF 读取失败/)
  assert.match(m3, /选择 3MF 文件…/)
  assert.match(m3, /import3MF/)
})

test('acceptMeshDropFile unchanged (still primary BOT-D path)', () => {
  const start = store.indexOf('acceptMeshDropFile: async')
  const end = store.indexOf('openDxfDialog: () => {')
  const block = store.slice(start, end)
  assert.match(block, /正在读取 \$\{kind\.toUpperCase\(\)\}「\$\{file\.name\}」…/)
  assert.match(block, /openMeshInsert\('stl'/)
  assert.match(block, /import3MF/)
})

test('MESH INSERT tip mentions viewport drag-drop', () => {
  assert.match(ribbonSrc, /拖到視口導入|拖到视口导入/)
  assert.match(ribbonSrc, /insertmesh.*插入STL网格/)
})

test('i18n keeps v1.44 MESH hint + chooser phrases as Chinese identities', () => {
  assert.match(i18nSrc, /v1\.44: MESH tab hint/)
  assert.match(i18nSrc, /'可将 \.stl \/ \.obj \/ \.3mf 拖到视口导入（或用「插入STL」\/ File→导入）': '可将 \.stl \/ \.obj \/ \.3mf 拖到视口导入（或用「插入STL」\/ File→导入）'/)
  assert.match(i18nSrc, /'选择 OBJ 文件…': '选择 OBJ 文件…'/)
  assert.match(i18nSrc, /'选择 3MF 文件…': '选择 3MF 文件…'/)
  assert.match(i18nSrc, /'正在读取 STL「': '正在读取 STL「'/)
})
