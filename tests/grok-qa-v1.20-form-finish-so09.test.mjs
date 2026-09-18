/**
 * v1.20 P3 BUG-BD-1901 Form Finish pinned + P2 SO09 combine New Body guidance.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const formPalette = readFileSync(new URL('../src/components/FormPalette.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbonTs = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.2x', () => {
  assert.match(version, /APP_VERSION = '1\.(2\d|[3-9]\d)'/)
})

test('BUG-BD-1901: FormPalette footer stays pinned outside scroll body', () => {
  assert.match(formPalette, /footer\?: ReactNode/)
  assert.match(formPalette, /data-testid="form-palette-footer"/)
  assert.match(formPalette, /flexShrink: 0/)
  assert.match(viewport, /data-testid="finish-form-panel"/)
  assert.match(viewport, /footer=\{\(/)
})

test('BUG-BD-1901: Ribbon Finish Form/Sketch pinned outside ribbon-panels scroller', () => {
  assert.match(ribbon, /data-testid="finish-form-pin"/)
  assert.match(ribbon, /data-testid="finish-sketch-pin"/)
  assert.match(ribbon, /finish-sketch finish-pinned/)
  assert.match(ribbon, /ribbon-panels-row/)
  assert.match(css, /\.finish-sketch\.finish-pinned/)
})

test('SO09: openCombineDlg clarifies New Body dual-body path', () => {
  assert.match(storeSrc, /没有工具体（泊车实体）/)
  assert.match(storeSrc, /「新实体」/)
  assert.match(viewport, /data-testid="combine-need-newbody"/)
})

test('CAM entry documented under 实验室/制造 CAM (intentionally not SOLID)', () => {
  assert.match(ribbonTs, /name: '制造 CAM'/)
  assert.match(ribbonTs, /id: 'finish3d'/)
  assert.match(ribbonTs, /label: '3D加工'/)
})
