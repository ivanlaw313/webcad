// P3: axis-aligned ellipse mouse commit must clear the live「水平軸全長」chip (sketchDim).
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')

test('axis-aligned ellipse click-commit clears sketchDim full-length chip', async () => {
  useApp.setState({
    ...useApp.getInitialState(),
    mode: 'sketch',
    sketchTool: 'ellipse',
    ellipseCreation: 'axis-aligned',
    sketchProfiles: [],
    sketchShape: null,
    autoConstrain: false,
  })
  await useApp.getState().onSketchClick([0, 0])
  assert.ok(useApp.getState().sketchStart, useApp.getState().status)
  // Simulate the live readout that would appear while dragging the corner.
  useApp.setState({ sketchDim: '⬭ 水平軸全長 40.0 × 豎直軸全長 20.0 mm', dimBuf: ['', ''], sketchPreview: [20, 10] })
  await useApp.getState().onSketchClick([20, 10])
  const s = useApp.getState()
  assert.ok(s.sketchShape?.ell, s.status)
  assert.equal(s.sketchDim, null, 'stale full-length chip must be cleared')
  assert.deepEqual(s.dimBuf, ['', ''])
  assert.equal(s.dimField, 0)
})
