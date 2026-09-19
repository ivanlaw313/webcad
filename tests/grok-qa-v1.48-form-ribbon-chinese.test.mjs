/**
 * v1.48: FORM contextual ribbon + SOLID Create Form Chinese labels (zh source / tLabel).
 * No MESH / Form plane / Pipe-dim regression.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.48+', () => {
  assert.match(version, /APP_VERSION = '1\.48'|APP_VERSION = '1\.(4[9]|[5-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.48: SOLID Create Form label is Chinese source', () => {
  assert.match(ribbon, /id: 'createform', label: '创建造型'/)
  assert.match(i18n, /'创建造型': 'Create Form'/)
})

test('v1.48: FORM_PANELS CREATE tools Chinese source', () => {
  assert.match(ribbon, /id: 'formbox', label: '长方体'/)
  assert.match(ribbon, /id: 'formcyl', label: '圆柱'/)
  assert.match(ribbon, /id: 'formsphere', label: '球'/)
  assert.match(ribbon, /id: 'formtorus', label: '圆环'/)
  assert.match(ribbon, /id: 'formquadball', label: '四边形球体'/)
  assert.match(ribbon, /id: 'formpipe', label: '管道'/)
  assert.match(ribbon, /id: 'formface', label: '面'/)
  assert.match(ribbon, /id: 'formplane', label: '平面'/)
  assert.match(ribbon, /id: 'formsketch', label: '创建草图'/)
  // no English leftover labels in FORM create
  assert.doesNotMatch(ribbon, /id: 'formbox', label: 'Box'/)
  assert.doesNotMatch(ribbon, /id: 'formcyl', label: 'Cylinder'/)
  assert.doesNotMatch(ribbon, /id: 'formpipe', label: 'Pipe'/)
})

test('v1.48: FORM_PANELS MODIFY / SYMMETRY / UTILITIES Chinese', () => {
  assert.match(ribbon, /id: 'formedit', label: '编辑造型'/)
  assert.match(ribbon, /id: 'formsubdiv', label: '细分'/)
  assert.match(ribbon, /id: 'formloop', label: '插入边'/)
  assert.match(ribbon, /id: 'formcrease', label: '折痕'/)
  assert.match(ribbon, /id: 'formfillhole', label: '填补孔'/)
  assert.match(ribbon, /id: 'formsymmetry', label: '造型对称'/)
  assert.match(ribbon, /id: 'formrepair', label: '修复实体'/)
  assert.match(ribbon, /id: 'forminsert', label: '插入网格'/)
  assert.match(ribbon, /id: 'offsetplane', label: '偏移平面'/)
  assert.doesNotMatch(ribbon, /id: 'formedit', label: 'Edit Form'/)
  assert.doesNotMatch(ribbon, /id: 'formsubdiv', label: 'Subdivide'/)
})

test('v1.48: EN_LABEL + ZH_GROUP for FORM ribbon', () => {
  assert.match(i18n, /'编辑造型': 'Edit Form'/)
  assert.match(i18n, /'四边形球体': 'Quadball'/)
  assert.match(i18n, /'细分': 'Subdivide'/)
  assert.match(i18n, /'造型对称': 'Symmetry'/)
  assert.match(i18n, /'插入网格': 'Insert Mesh'/)
  assert.match(i18n, /SYMMETRY: '对称'/)
  assert.match(i18n, /UTILITIES: '工具'/)
  assert.match(i18n, /FORM: '造型'/)
  // sketch constraint 对称 must remain Symmetric (not clobbered)
  assert.match(i18n, /'对称': 'Symmetric'/)
})

test('v1.48: FORM workspace tab Chinese when lang=zh', () => {
  assert.match(ribbonUi, /data-testid="form-workspace-tab"/)
  assert.match(ribbonUi, /lang === 'en' \? 'FORM' : '造型'/)
})

test('v1.47 Pipe/dims + Finish Chinese retained', () => {
  assert.match(viewport, /form-pipe-hint/)
  assert.match(viewport, /zh \? '路径点 \(x,y,z; …\)' : 'Path points/)
  assert.match(viewport, /lang !== 'en' \? '完成造型' : 'Finish Form'/)
  assert.match(ribbonUi, /Finish Form' : '完成造型'/)
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
