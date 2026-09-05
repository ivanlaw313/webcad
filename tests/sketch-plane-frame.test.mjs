import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Keep this regression test runnable with Node's native test runner.  Node 22
// does not import TypeScript source files directly, even when the module has
// no runtime dependencies.
const source = await readFile(new URL('../src/cad/sketchPlaneFrame.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { cardinalSketchFrame, frameY, localPointToCad } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

test('cardinal sketch frames map local profile points into the intended CAD planes', () => {
  assert.deepEqual(localPointToCad(cardinalSketchFrame('XY', 7), 2, 3), [2, 3, 7])
  assert.deepEqual(localPointToCad(cardinalSketchFrame('XZ', 7), 2, 3), [2, 7, 3])
  assert.deepEqual(localPointToCad(cardinalSketchFrame('YZ', 7), 2, 3), [7, 2, 3])
})

test('cardinal frames preserve the kernel extrusion directions', () => {
  assert.deepEqual(cardinalSketchFrame('XY', 0).n, [0, 0, 1])
  assert.deepEqual(cardinalSketchFrame('XZ', 0).n, [0, -1, 0])
  assert.deepEqual(cardinalSketchFrame('YZ', 0).n, [1, 0, 0])
  assert.deepEqual(frameY(cardinalSketchFrame('XZ', 0)), [0, 0, 1])
})
