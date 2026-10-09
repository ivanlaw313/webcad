// RETEST5：顶面完成草图开放折线 → 加強筋确认后须真正增加实体体积（可见墙），唔可以落底嵌进板内。
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
const { importSTEP, measureVolume } = await import('replicad')
const g = () => useApp.getState()
const stepVol = async () => measureVolume(await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()])))

test('RETEST5: top-face open polyline rib (到实体) increases plate volume', async () => {
  useApp.setState(useApp.getInitialState(), true)
  g().startSketch(); g().chooseSketchPlane('XY')
  // 50×40×10 plate → 20000 mm³（同 live QA）
  useApp.setState({
    sketchShape: { type: 'rect', a: [-25, -20], b: [25, 20] },
    sketchProfiles: [], skCons: [], extrudeHeight: 10, sketchOp: 'new',
  })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  const vol0 = await stepVol()
  assert.ok(Math.abs(vol0 - 20000) < 1e-3, `plate volume ${vol0}`)

  // Axis-aligned top face sketch（startSketchOnFace XY path：arb=null, baseZ=top）
  g().startSketch(); g().chooseSketchPlane('XY')
  useApp.setState({
    sketchBaseZ: 10, sketchArb: null, sketchFromFace: true,
    polyPts: [[-20, 0], [20, 0]], polyBulges: [0], sketchTool: 'polyline',
  })
  await g().finishOpenPolyline()
  await g().commitStandaloneSketch()
  const pathId = Object.keys(g().sketchSources).find((k) =>
    g().sketchSources[k].shapes.some((s) => s.type === 'poly'))
  assert.ok(pathId)
  assert.equal(g().sketchSources[pathId].baseZ, 10)
  assert.equal(g().sketchSources[pathId].arb, undefined)

  g().setSelSketch(pathId)
  await g().runCommand('rib', '加強筋')
  assert.equal(g().featDlg?.kind, 'rib', g().status)
  assert.equal(g().featDlg.params.extent, 'next')
  assert.equal(g().featDlg.params.thickness, 6)
  assert.equal(g().featDlg.params.height, 20)
  await g().commitFeatDlg()

  const rib = g().features.find((f) => f.type === 'rib')
  assert.ok(rib, g().status)
  assert.equal(rib.baseZ, 10)
  assert.equal(rib.extent, undefined) // 'next' → undefined on feature
  assert.match(g().status, /到实体|到實體/)

  const vol1 = await stepVol()
  // Standing wall ≈ 40×6×20 = 4800 on top of 20000
  assert.ok(vol1 > vol0 + 1000, `volume must rise: before=${vol0} after=${vol1} status=${g().status}`)
  assert.ok(Math.abs(vol1 - 24800) < 1, `expected ~24800 mm³, got ${vol1}`)

  const m = g().bodyMesh
  let zmax = -Infinity
  for (let i = 2; i < (m?.vertices?.length || 0); i += 3) zmax = Math.max(zmax, m.vertices[i])
  assert.ok(zmax > 25, `rib wall should rise above plate top (zmax=${zmax})`)
})
