// Aero Design Lab — the generated CAD bodies are valid OCCT solids (volume > 0, close to the
// analytic/mesh estimate) and export to STEP (the stepbody timeline feature path).
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const replicad = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
replicad.setOC(OC)
const { buildAeroShape } = await import('../src/aero/aeroCad.ts')
const { designMesh, meshVolume } = await import('../src/aero/geometry.ts')
const { propTemplate, wingTemplate, shellTemplate } = await import('../src/aero/templates.ts')

const volume = (shape) => {
  const props = new OC.GProp_GProps_1()
  OC.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false)
  return props.Mass()
}

for (const [name, mk, tol] of [['wing', wingTemplate, 0.08], ['prop', propTemplate, 0.2], ['shell', shellTemplate, 0.03]]) {
  test(`${name}: replicad body is a valid solid matching the mesh volume, exports STEP`, async () => {
    const spec = mk()
    const x = Object.fromEntries(spec.vars.map((v) => [v.key, v.value]))
    const shape = buildAeroShape(replicad, spec, x)
    assert.ok(shape && !shape.wrapped.IsNull(), 'shape built')
    const v = volume(shape)
    const ref = meshVolume(designMesh(spec, x))
    assert.ok(v > 0, `volume ${v}`)
    // prop: the mesh double-counts blade roots buried in the hub; the fused B-rep does not
    if (name === 'prop') assert.ok(v < ref * 1.02 && v > ref * (1 - tol * 2), `fused B-rep volume ${v.toFixed(0)} vs summed parts ${ref.toFixed(0)} mm³`)
    else assert.ok(Math.abs(v - ref) / ref < tol, `B-rep volume ${v.toFixed(0)} vs mesh ${ref.toFixed(0)} mm³`)
    const mesh = shape.mesh({ tolerance: 0.2, angularTolerance: 0.5 })
    assert.ok(mesh.triangles.length > 30, 'tessellates')
    const step = await shape.blobSTEP().text()
    assert.match(step, /ISO-10303-21/)
    const back = await replicad.importSTEP(new Blob([step]))
    assert.ok(Math.abs(volume(back) - v) / v < 1e-3, 'STEP round-trip keeps the solid')
  })
}
