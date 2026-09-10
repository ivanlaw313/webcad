import test from 'node:test'
import assert from 'node:assert/strict'
import { fitCameraDistance } from '../src/cad/fitCameraDistance.ts'

test('fit contains the bounding sphere in both axes at narrow, wide and zoomed viewports', () => {
  for (const aspect of [0.4, 0.76, 1, 2, 3]) for (const zoom of [1, 1.5, 3]) {
    const r = 250, fov = 28, distance = fitCameraDistance(r, fov, aspect, zoom)
    const angularRadius = Math.asin(r / distance)
    const vertical = Math.atan(Math.tan(fov * Math.PI / 360) / zoom)
    const horizontal = Math.atan(Math.tan(vertical) * aspect)
    assert.ok(angularRadius < vertical && angularRadius < horizontal, `${aspect}, ${zoom}`)
  }
})
