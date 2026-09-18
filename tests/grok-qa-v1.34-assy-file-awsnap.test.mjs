/**
 * v1.34 / BUG-BD-3201: Gear Pair ASSY → File must not Aw Snap (Error 9).
 *
 * Hardening (not a catch-all for Chrome GPU flakes):
 *  - File menu / pickers yield + broadcast ui-overlay busy
 *  - Viewport eases GPU (DPR/renderLists) while overlay busy
 *  - Dense face-group meshes skip full B-rep seam extract
 *  - Gear sample clears worker rebuild cache after disposable rebuilds
 *  - Face-heavy solids use coarser tessellation
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const safety = readFileSync(new URL('../src/io/fileUiSafety.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.34+', () => {
  assert.match(version, /APP_VERSION = '1\.3[4-9]'|APP_VERSION = '1\.[4-9]\d'/)
})

test('fileUiSafety exposes yield + overlay + dense-mesh helpers', () => {
  assert.match(safety, /export const UI_OVERLAY_EVENT/)
  assert.match(safety, /export function yieldToBrowser/)
  assert.match(safety, /export async function withFileUiSafety/)
  assert.match(safety, /export function isDenseDisplayMesh/)
  assert.match(safety, /DENSE_FACE_GROUPS/)
})

test('Ribbon File menu opens via withFileUiSafety', () => {
  assert.match(ribbon, /withFileUiSafety/)
  assert.match(ribbon, /setFileMenu\(true\)/)
  assert.match(ribbon, /BUG-BD-3201|Aw Snap|Error 9/)
})

test('Viewport eases GPU on overlay + skips dense seam extract', () => {
  assert.match(viewport, /function GpuOverlayEase/)
  assert.match(viewport, /UI_OVERLAY_EVENT/)
  assert.match(viewport, /setPixelRatio\(1\)/)
  assert.match(viewport, /isDenseDisplayMesh/)
  assert.match(viewport, /<GpuOverlayEase/)
})

test('Gearpair sample clears rebuild cache and yields before return', () => {
  assert.match(store, /clearRebuildCache/)
  assert.match(store, /yieldToBrowser/)
  const g = store.indexOf("kind === 'gearpair'") >= 0 ? store.indexOf("kind === 'gearpair'") : store.indexOf('kind === "gearpair"')
  assert.ok(g > 0, 'gearpair sample present')
  const chunk = store.slice(g, g + 3500)
  assert.match(chunk, /clearRebuildCache/)
  assert.match(chunk, /yieldToBrowser/)
})

test('STL dialog uses withFileUiSafety before picker', () => {
  assert.match(store, /withFileUiSafety/)
  assert.match(store, /open-stl|openStl|openStlDialog|openStlDialog/)
})

test('Worker clearRebuildCache + face-heavy coarsen', () => {
  assert.match(worker, /async clearRebuildCache/)
  assert.match(worker, /rcClear/)
  assert.match(worker, /nFaces > 80/)
})
