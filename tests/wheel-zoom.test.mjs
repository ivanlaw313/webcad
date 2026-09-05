import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Node's native runner does not execute .ts files.  Transpile this isolated
// dependency-free math module before importing it, so the regression test is
// genuinely runnable without introducing a second test runtime.
const source = await readFile(new URL('../src/cad/wheelZoom.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { normalizeWheelDelta, wheelZoomFactor } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('high-resolution wheel deltas stay proportional instead of becoming a minimum jump', () => {
  const tiny = wheelZoomFactor(1)
  assert.ok(tiny > 1 && tiny < 1.002, `1px delta should be tiny, got ${tiny}`)
  assert.ok(wheelZoomFactor(10) < wheelZoomFactor(100))
})

test('one conventional notch is gradual and symmetric', () => {
  const out = wheelZoomFactor(100)
  const inward = wheelZoomFactor(-100)
  assert.ok(out > 1.04 && out < 1.08, `100px notch should be gradual, got ${out}`)
  assert.ok(Math.abs(out * inward - 1) < 1e-12)
})

test('free-spin spikes are capped and delta modes are normalized', () => {
  assert.equal(normalizeWheelDelta(10000), 120)
  assert.equal(normalizeWheelDelta(-10000), -120)
  assert.equal(normalizeWheelDelta(3, 1), 48)
  assert.equal(normalizeWheelDelta(1, 2), 100)
})

test('fine mode is slower and reverse direction is exact', () => {
  const normal = wheelZoomFactor(100)
  const fine = wheelZoomFactor(100, 0, true)
  assert.ok(fine > 1 && fine < normal)
  assert.ok(Math.abs(wheelZoomFactor(100, 0, false, -1) - 1 / normal) < 1e-12)
})
