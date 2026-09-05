import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

async function loadModule() {
  const source = readFileSync(new URL('../src/cad/featureFailureMap.ts', import.meta.url), 'utf8')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
}

const { mapKernelFailuresToTimeline } = await loadModule()

test('maps Hole kernel child failures back to the visible parent feature', () => {
  const result = mapKernelFailuresToTimeline([
    { id: 'H1:drill', type: 'extrude', msg: 'drill failed' },
    { id: 'H1:mouth-chamfer', type: 'loft', msg: 'chamfer failed' },
    { id: 'F2', type: 'fillet', msg: 'radius too large' },
  ], [{ id: 'H1', type: 'hole' }, { id: 'F2', type: 'fillet' }])
  assert.deepEqual(result.ids, ['H1', 'F2'])
  assert.equal(result.errors.H1, 'drill failed；chamfer failed')
  assert.equal(result.errors.F2, 'radius too large')
})
