/**
 * v1.49 / BUG-BD-4801: FORM ribbon + Create Form labels Traditional Chinese (HK).
 * Assert 長方體/圓柱/管道/建立造型 — not Simplified 长方体/圆柱/创建造型.
 * Keep sketch constraint 对称 → Symmetric; no MESH / plane / Finish soft-lock regress.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const formPalette = readFileSync(new URL('../src/components/FormPalette.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.49+', () => {
  assert.match(version, /APP_VERSION = '1\.49'|APP_VERSION = '1\.[5-9]\d'|APP_VERSION = '[2-9]\./)
})

test('BUG-BD-4801: FORM ribbon Traditional (長方體/圓柱/管道)', () => {
  assert.match(ribbon, /id: 'formbox', label: '長方體'/)
  assert.match(ribbon, /id: 'formcyl', label: '圓柱'/)
  assert.match(ribbon, /id: 'formpipe', label: '管道'/)
  assert.match(ribbon, /id: 'formquadball', label: '四邊形球體'/)
  assert.match(ribbon, /id: 'formedit', label: '編輯造型'/)
  assert.match(ribbon, /id: 'formsubdiv', label: '細分'/)
  assert.match(ribbon, /id: 'formsymmetry', label: '造型對稱'/)
  // must NOT keep Simplified orthography on Form CREATE tools
  assert.doesNotMatch(ribbon, /id: 'formbox', label: '长方体'/)
  assert.doesNotMatch(ribbon, /id: 'formcyl', label: '圆柱'/)
  assert.doesNotMatch(ribbon, /id: 'createform', label: '创建造型'/)
})

test('BUG-BD-4801: SOLID entry 建立造型 (HK wording)', () => {
  assert.match(ribbon, /id: 'createform', label: '建立造型'/)
  assert.match(i18n, /'建立造型': 'Create Form'/)
  assert.match(viewport, /createTitle = zh \? '建立造型' : 'Create Form'/)
  assert.match(formPalette, /建立造型/)
})

test('v1.49: EN_LABEL Traditional keys + sketch 对称 intact', () => {
  assert.match(i18n, /'長方體': 'Box'/)
  assert.match(i18n, /'圓柱': 'Cylinder'/)
  assert.match(i18n, /'編輯造型': 'Edit Form'/)
  assert.match(i18n, /'造型對稱': 'Symmetry'/)
  assert.match(i18n, /SYMMETRY: '對稱'/)
  // sketch constraint mapping must remain Symmetric (not clobbered by FORM)
  assert.match(i18n, /'对称': 'Symmetric'/)
})

test('v1.47 Finish Form + dialog Traditional retained', () => {
  assert.match(viewport, /lang !== 'en' \? '完成造型' : 'Finish Form'/)
  assert.match(viewport, /lang !== 'en' \? '編輯造型' : 'Edit Form'/)
  assert.match(viewport, /lang !== 'en' \? '取消造型' : 'Cancel Form'/)
  assert.match(ribbonUi, /Finish Form' : '完成造型'/)
  assert.match(viewport, /zh \? '路徑點 \(x,y,z; …\)' : 'Path points/)
  assert.match(viewport, /zh \? '直徑' : 'Diameter'/)
  assert.match(viewport, /zh \? '面數' : 'Faces'/)
})

test('v1.46 plane buttons + v1.45 Box soft-lock retained', () => {
  assert.match(viewport, /data-testid=\{`form-\$\{createKind\}-plane-\$\{pl\}`\}/)
  assert.match(viewport, /form-create-plane-hint/)
  assert.match(store, /placeFormBoxOnOriginPlane/)
  assert.match(store, /BUG-BD-4401/)
})

test('no MESH drag-drop / chooser parity regression (v1.41–1.44)', () => {
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  assert.match(viewport, /data-mesh-drop|ensureMeshDropHost|meshDropOverlay/)
})
