/**
 * v1.47: Create Form Pipe + dimension labels Chinese; Edit Form Finish/Cancel Chinese.
 * Pipe has no origin-plane control (path-based). No MESH / plane-button regression.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const formPalette = readFileSync(new URL('../src/components/FormPalette.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.47+', () => {
  assert.match(version, /APP_VERSION = '1\.47'|APP_VERSION = '1\.(4[8-9]|[5-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.47: Pipe Create Form Chinese labels (no plane control)', () => {
  assert.match(viewport, /form-pipe-path-label/)
  assert.match(viewport, /form-pipe-profile-label/)
  assert.match(viewport, /form-pipe-diameter-label/)
  assert.match(viewport, /form-pipe-faces-label/)
  assert.match(viewport, /form-pipe-hint/)
  assert.match(viewport, /zh \? '路径点 \(x,y,z; …\)' : 'Path points/)
  assert.match(viewport, /zh \? '轮廓' : 'Profile'/)
  assert.match(viewport, /zh \? '圆' : 'Circle'/)
  assert.match(viewport, /zh \? '轮廓面数' : 'Profile Faces'/)
  assert.match(viewport, /输入路径点后点确定/)
  // Pipe still skips origin-plane buttons / orientFormCage
  assert.match(viewport, /createKind !== 'pipe' && <label[\s\S]*?planeLabel/)
  assert.match(viewport, /createKind !== 'box' && createKind !== 'pipe'\) useApp\.getState\(\)\.orientFormCage/)
})

test('v1.47: Create Form dimension labels Chinese', () => {
  assert.match(viewport, /const dimDiameter = zh \? '直径' : 'Diameter'/)
  assert.match(viewport, /const dimHeight = zh \? '高度' : 'Height'/)
  assert.match(viewport, /const dimFaces = zh \? '面数' : 'Faces'/)
  assert.match(viewport, /const dimMajor = zh \? '大径 Ø' : 'Major Ø'/)
  assert.match(viewport, /zh \? '长度' : 'Length'/)
  assert.match(viewport, /zh \? '宽度' : 'Width'/)
})

test('v1.47: Edit Form Finish/Cancel Chinese + ribbon pin', () => {
  assert.match(viewport, /lang !== 'en' \? '编辑造型' : 'Edit Form'/)
  assert.match(viewport, /lang !== 'en' \? '完成造型' : 'Finish Form'/)
  assert.match(viewport, /lang !== 'en' \? '取消造型' : 'Cancel Form'/)
  assert.match(viewport, /data-testid="finish-form-panel"/)
  assert.match(viewport, /data-testid="cancel-form-panel"/)
  assert.match(ribbon, /Finish Form' : '完成造型'/)
  assert.match(formPalette, /编辑造型/)
})

test('v1.46 plane buttons + v1.45 Box soft-lock retained', () => {
  assert.match(viewport, /data-testid=\{`form-\$\{createKind\}-plane-\$\{pl\}`\}/)
  assert.match(viewport, /form-create-plane-hint/)
  assert.match(viewport, /点 XY \/ XZ \/ YZ 选基准面/)
  assert.match(store, /placeFormBoxOnOriginPlane/)
  assert.match(store, /BUG-BD-4401/)
})

test('no MESH drag-drop / chooser parity regression (v1.41–1.44)', () => {
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  assert.match(viewport, /data-mesh-drop|ensureMeshDropHost|meshDropOverlay/)
  assert.match(store, /正在读取 STL/)
})
