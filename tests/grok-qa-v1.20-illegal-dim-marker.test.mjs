/**
 * v1.20 P2: sketch Dimension ≤0 must surface 「尺寸已拒绝」 in the visible alert
 * (inputError), not only status — UI bot @1.19 saw detail-only copy.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { illegalRejectStatus, ILLEGAL_REJECT_MARKER } from '../src/ui/illegalInput.ts'

const layer = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const dimInput = readFileSync(new URL('../src/sketch/dimensionEditInput.ts', import.meta.url), 'utf8')
const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.2x', () => {
  assert.match(version, /APP_VERSION = '1\.2\d'/)
})

test('SketchLayer inputError uses illegalRejectStatus for ≤0 dims', () => {
  assert.match(layer, /from '\.\.\/ui\/illegalInput'/)
  assert.match(layer, /setInputError\(illegalRejectStatus\(result\.error\)\)/)
  assert.match(layer, /setInputError\(illegalRejectStatus\('尺寸必须为有限正数'\)\)/)
  assert.match(layer, /status:illegalRejectStatus\(result\.error\)/)
})

test('store param/formula dim rejects embed 尺寸已拒绝', () => {
  assert.match(storeSrc, /illegalRejectStatus\('参数尺寸必须为有限正数，未更改草图'\)/)
  assert.match(storeSrc, /illegalRejectStatus\('公式尺寸必须为有限正数，未更改草图'\)/)
})

test('dimensionEditInput detail + illegalRejectStatus → exact marker', () => {
  assert.match(dimInput, /尺寸必须为有限正数；水平／垂直距离可为零/)
  const wrapped = illegalRejectStatus('尺寸必须为有限正数；水平／垂直距离可为零')
  assert.equal(ILLEGAL_REJECT_MARKER, '尺寸已拒绝')
  assert.match(wrapped, /^尺寸已拒绝：/)
  assert.match(wrapped, /尺寸必须为有限正数/)
})
