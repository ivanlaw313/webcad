/**
 * v1.45 BUG-BD-4401: Create Form → Box plane pick must complete without soft-lock.
 * - Dialog XY/XZ/YZ buttons call placeFormBoxOnOriginPlane → stage ready
 * - commitFormBoxDraft accepts plane+defaults (not only stage===ready)
 * - finishForm cancels in-flight create (no Cancel-required soft-lock)
 * - Origin construction planes pickable during formBoxDraft.stage==='plane'
 * - Does not regress MESH drag-drop / chooser parity (v1.41–1.44 markers stay)
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.45+', () => {
  assert.match(version, /APP_VERSION = '1\.45'|APP_VERSION = '1\.(4[6-9]|[5-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('BUG-BD-4401: dialog origin-plane quick place API', () => {
  assert.match(store, /placeFormBoxOnOriginPlane/)
  assert.match(store, /BUG-BD-4401/)
  assert.match(store, /stage: 'ready'/)
  assert.match(viewport, /data-testid=\{`form-box-plane-\$\{pl\}`\}/)
  assert.match(viewport, /placeFormBoxOnOriginPlane\(pl\)/)
  assert.match(viewport, /Select XY\/XZ\/YZ below/)
})

test('BUG-BD-4401: commitFormBoxDraft accepts plane with default center', () => {
  const start = store.indexOf('commitFormBoxDraft: async')
  assert.ok(start > 0)
  const block = store.slice(start, start + 700)
  assert.match(block, /!raw\.plane/)
  assert.match(block, /center: raw\.center \?\? \(\[0, 0\]/)
  assert.match(block, /stage: 'ready'/)
  assert.match(viewport, /data-testid="form-box-ok"/)
  assert.match(viewport, /disabled=\{!boxDraft\.plane\}/)
})

test('BUG-BD-4401: finishForm cancels in-flight create (no soft-lock)', () => {
  const start = store.indexOf('finishForm: async')
  const block = store.slice(start, start + 900)
  assert.match(block, /if \(s0\.formCreateKind\)/)
  assert.match(block, /cancelFormCreate\(\)/)
  assert.doesNotMatch(block.slice(0, 500), /formCreateKind\) \{ set\(\{ status: '请先完成或取消当前 Form 操作'/)
})

test('BUG-BD-4401: origin planes pickable + larger Form Box datums', () => {
  assert.match(viewport, /formBoxPlanePick/)
  assert.match(viewport, /mode === 'pickplane' \|\| !!formBoxPlanePick/)
  assert.match(viewport, /chooseFormBoxPlane\(pl\.base, o\)/)
  assert.match(viewport, /size=\{160\}/)
  assert.match(viewport, /draft\?\.stage === 'plane' && controls/)
})

test('no MESH drag-drop / chooser parity regression (v1.41–1.44)', () => {
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile|acceptMeshDropFile/)
  assert.match(viewport, /data-mesh-drop|ensureMeshDropHost|meshDropOverlay/)
  assert.match(store, /正在读取 STL|正在读取 STL/)
})
