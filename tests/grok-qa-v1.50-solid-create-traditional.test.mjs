/**
 * v1.50: SOLID (+ MESH) CREATE ribbon Traditional Chinese (HK).
 * Continue BUG-BD-4801 orthography: 建立草圖 / 長方體 / 圓柱 — not 创建草图 / 长方体 / 圆柱.
 * Keep FORM TC, sketch 对称→Symmetric, MESH DnD / plane / Finish intact.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.50+', () => {
  assert.match(version, /APP_VERSION = '1\.50'|APP_VERSION = '1\.[6-9]\d'|APP_VERSION = '[2-9]\./)
})

test('v1.50: SOLID CREATE Traditional (建立草圖 / 長方體 / 圓柱 / 圓環)', () => {
  assert.match(ribbon, /id: 'sketch', label: '建立草圖'/)
  assert.match(ribbon, /id: 'box', label: '長方體'/)
  assert.match(ribbon, /id: 'cylinder', label: '圓柱'/)
  assert.match(ribbon, /id: 'torus', label: '圓環'/)
  // must NOT keep Simplified orthography on SOLID CREATE tools
  assert.doesNotMatch(ribbon, /id: 'sketch', label: '创建草图'/)
  assert.doesNotMatch(ribbon, /id: 'box', label: '长方体'/)
  assert.doesNotMatch(ribbon, /id: 'cylinder', label: '圆柱'/)
  assert.doesNotMatch(ribbon, /id: 'torus', label: '圆环'/)
})

test('v1.50: MESH CREATE Box/Cylinder Traditional', () => {
  // MESH panel uses same Traditional labels
  const meshBlock = ribbon.slice(ribbon.indexOf('const MESH:'))
  assert.match(meshBlock, /id: 'box', label: '長方體'/)
  assert.match(meshBlock, /id: 'cylinder', label: '圓柱'/)
})

test('v1.50: FD_TITLE + EN_LABEL + quick menu', () => {
  assert.match(viewport, /box: '長方體'/)
  assert.match(viewport, /cylinder: '圓柱'/)
  assert.match(viewport, /torus: '圓環'/)
  assert.match(viewport, /label: '建立草圖', fn: \(\) => startSketch\(\)/)
  assert.match(viewport, /runCommand\('box', '長方體'\)/)
  assert.match(i18n, /'建立草圖': 'Create Sketch'/)
  assert.match(i18n, /'長方體': 'Box'/)
  assert.match(i18n, /'圓柱': 'Cylinder'/)
  assert.match(i18n, /'圓環': 'Torus'/)
})

test('v1.49 FORM Traditional retained (BUG-BD-4801)', () => {
  assert.match(ribbon, /id: 'createform', label: '建立造型'/)
  assert.match(ribbon, /id: 'formbox', label: '長方體'/)
  assert.match(ribbon, /id: 'formcyl', label: '圓柱'/)
  assert.match(ribbon, /id: 'formedit', label: '編輯造型'/)
  assert.match(i18n, /'对称': 'Symmetric'/)
})

test('no MESH / Form plane / Finish soft-lock regression', () => {
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  assert.match(store, /placeFormBoxOnOriginPlane/)
  assert.match(viewport, /form-create-plane-hint/)
  assert.match(viewport, /lang !== 'en' \? '完成造型' : 'Finish Form'/)
})
