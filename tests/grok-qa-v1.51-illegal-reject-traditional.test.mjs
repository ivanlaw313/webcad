/**
 * v1.51: Illegal UX reject marker Traditional Chinese (HK).
 * 「尺寸已拒絕」 not Simplified 「尺寸已拒绝」; details 必須／大於／孔徑／草圖.
 * Keep FORM/SOLID CREATE TC, MESH DnD / plane / Finish intact.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  ILLEGAL_REJECT_MARKER,
  ILLEGAL_THICKNESS_DETAIL,
  ILLEGAL_LENGTH_DETAIL,
  ILLEGAL_HOLE_DETAIL,
  illegalRejectStatus,
  isIllegalRejectStatus,
} from '../src/ui/illegalInput.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const dimInput = readFileSync(new URL('../src/sketch/dimensionEditInput.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.51+', () => {
  assert.match(version, /APP_VERSION = '1\.(5[1-9]|[6-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.51: ILLEGAL_REJECT_MARKER is Traditional 尺寸已拒絕', () => {
  assert.equal(ILLEGAL_REJECT_MARKER, '尺寸已拒絕')
  assert.doesNotMatch(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒绝'/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
})

test('v1.51: shared detail constants Traditional', () => {
  assert.equal(ILLEGAL_THICKNESS_DETAIL, '壁厚必須大於 0')
  assert.equal(ILLEGAL_LENGTH_DETAIL, '尺寸必須大於 0，未更改模型')
  assert.equal(ILLEGAL_HOLE_DETAIL, '孔徑Ø必須大於 0')
  assert.match(illegalRejectStatus(ILLEGAL_THICKNESS_DETAIL), /^尺寸已拒絕：壁厚必須大於 0$/)
  assert.match(illegalRejectStatus(''), /尺寸已拒絕：非法輸入/)
  assert.equal(isIllegalRejectStatus(illegalRejectStatus('x')), true)
})

test('v1.51: hole alert + store rejects use TC marker', () => {
  assert.match(viewport, /尺寸已拒絕：孔徑Ø必須大於 0（已清除非法預覽）/)
  assert.doesNotMatch(viewport, /尺寸已拒绝/)
  assert.match(store, /尺寸已拒絕/)
  assert.doesNotMatch(store, /尺寸已拒绝/)
  assert.match(store, /illegalRejectStatus\('參數尺寸必須為有限正數，未更改草圖'\)/)
  assert.match(store, /illegalRejectStatus\('公式尺寸必須為有限正數，未更改草圖'\)/)
  assert.match(dimInput, /尺寸必須為有限正數；水平／垂直距離可為零/)
})

test('v1.50 SOLID CREATE + v1.49 FORM Traditional retained', () => {
  assert.match(ribbon, /id: 'sketch', label: '建立草圖'/)
  assert.match(ribbon, /id: 'box', label: '長方體'/)
  assert.match(ribbon, /id: 'createform', label: '建立造型'/)
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
