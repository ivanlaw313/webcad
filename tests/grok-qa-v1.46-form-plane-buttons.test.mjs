/**
 * v1.46: Form Cylinder/Sphere/Plane/Torus/Face/Quadball Create dialog —
 * XY/XZ/YZ origin-plane **buttons** (parity with Box v1.45), not a <select>.
 * Chinese Plane/OK/Cancel when lang !== 'en'. No MESH / Box soft-lock regression.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const formPalette = readFileSync(new URL('../src/components/FormPalette.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.46+', () => {
  assert.match(version, /APP_VERSION = '1\.46'|APP_VERSION = '1\.(4[7-9]|[5-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.46: non-box Form create uses XY/XZ/YZ plane buttons (not select)', () => {
  assert.match(viewport, /data-testid=\{`form-\$\{createKind\}-plane-\$\{pl\}`\}/)
  assert.match(viewport, /form-create-plane-hint/)
  assert.match(viewport, /點 XY \/ XZ \/ YZ 選基準面/)
  // Old Plane <select aria-label="Form plane"> must be gone
  assert.doesNotMatch(viewport, /aria-label="Form plane"/)
  assert.match(viewport, /orientFormCage\(formPlane/)
})

test('v1.46: Chinese Plane / OK / Cancel on Create Form', () => {
  assert.match(viewport, /zh \? '平面' : 'Plane'/)
  assert.match(viewport, /zh \? '確定' : 'OK'/)
  assert.match(viewport, /zh \? '取消' : 'Cancel'/)
  assert.match(viewport, /zh \? '建立造型' : 'Create Form'/)
  assert.match(formPalette, /建立造型/)
})

test('v1.45 Box plane buttons + finishForm soft-lock fix retained', () => {
  assert.match(store, /placeFormBoxOnOriginPlane/)
  assert.match(viewport, /data-testid=\{`form-box-plane-\$\{pl\}`\}/)
  assert.match(store, /BUG-BD-4401/)
  const start = store.indexOf('finishForm: async')
  assert.ok(start > 0)
  const block = store.slice(start, start + 900)
  assert.match(block, /if \(s0\.formCreateKind\)/)
  assert.match(block, /cancelFormCreate\(\)/)
})

test('no MESH drag-drop / chooser parity regression (v1.41–1.44)', () => {
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  assert.match(viewport, /data-mesh-drop|ensureMeshDropHost|meshDropOverlay/)
  assert.match(store, /正在读取 STL/)
})
