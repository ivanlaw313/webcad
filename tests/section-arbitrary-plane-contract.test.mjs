import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('Section Analysis carries an arbitrary datum-plane frame and uses it for a capped OCCT split', () => {
  assert.match(store, /section: \{ on: boolean; axis: 'X' \| 'Y' \| 'Z'; offset: number; capped: boolean; flip: boolean; plane\?/) 
  assert.match(store, /cad\.splitBuild\(active, \{ origin: origin!, normal: ref\.normal \}\)/)
  assert.match(worker, /axis: 'X' \| 'Y' \| 'Z' \| \{ origin: \[number, number, number\]; normal: \[number, number, number\] \}/)
  assert.match(worker, /if \(typeof axis === 'object'\)/)
  assert.match(worker, /lo = halfSpace\(1\); hi = halfSpace\(-1\)/)
})

test('Section dialog lets users choose every constructed plane, including XY/XZ/YZ offsets, then offset along its normal', () => {
  assert.match(viewport, /planes\.length > 0/)
  assert.match(viewport, /pl\.base === 'XY'/)
  assert.match(viewport, /label: `XY@\$\{pl\.offset\}`/)
  assert.match(viewport, /sourceIndex: i/)
  assert.match(viewport, /沿法向偏移/)
  assert.match(viewport, /setSection\(\{ axis: ax, plane: undefined, offset: 0 \}\)/)
  assert.match(viewport, /new Plane\(\)\.setFromNormalAndCoplanarPoint/)
})

test('Section properties project arbitrary-plane slices into an orthonormal local UV frame', () => {
  assert.match(store, /arbitrary datum: project CAD vertices into an orthonormal local \(u,v,n\) frame/)
  assert.match(store, /const u: \[number, number, number\] = \[ux0 \/ ul, ux1 \/ ul, ux2 \/ ul\]/)
  assert.match(store, /out\[i \+ 2\] = x \* n\[0\] \+ y \* n\[1\] \+ z \* n\[2\]/)
  assert.match(store, /局部 UV/)
})
