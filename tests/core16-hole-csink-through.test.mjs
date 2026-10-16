/**
 * CORE16 residual more8: Hole countersink / through-hole flags.
 * Legal countersink + through must change volume (cut more than drill alone when cs Ø > drill Ø).
 * Complements core16-hole-diameter-gate (Ø≤0 Formal refuse + simple through) without re-testing Ø gate.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const BOX = { id: 'box', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }

test('source: holeType countersink + holeThrough flags wired (store + Viewport)', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(st, /holeType: 'simple' \| 'counterbore' \| 'countersink'/)
  assert.match(st, /holeThrough: boolean/)
  assert.match(st, /countersink: \{ diameter: get\(\)\.holeCsD/)
  assert.match(st, /setHoleThrough:/)
  assert.match(vp, /setHoleType\('countersink'\)/)
  assert.match(vp, /checked=\{holeThrough\}/)
  assert.match(vp, /埋頭孔/)
})

test('runtime: legal through-all hole feature changes volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  assert.ok(Math.abs(v0 - 40 * 30 * 20) < 1, `seed vol ${v0}`)

  const hole = {
    id: 'ht',
    type: 'hole',
    kind: 'simple',
    center: [20, 15],
    top: 20,
    diameter: 8,
    through: true,
    extent: 'through-all',
  }
  assert.equal(await g().applyFeatures([BOX, hole], 'through'), true, g().status)
  const v1 = await vol()
  const expectCut = Math.PI * 4 * 4 * 20
  assert.ok(v1 < v0 - expectCut * 0.5, `through must cut: ${v0} → ${v1}`)
  assert.ok(Math.abs(v1 - (v0 - expectCut)) < 5, `Δ≈${expectCut}, got ${v0 - v1}`)
})

test('runtime: legal countersink through hole changes volume (more than simple drill alone)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()

  const simple = {
    id: 'hs',
    type: 'hole',
    kind: 'simple',
    center: [20, 15],
    top: 20,
    diameter: 6,
    through: true,
    extent: 'through-all',
  }
  assert.equal(await g().applyFeatures([BOX, simple], 'simple thru'), true, g().status)
  const vSimple = await vol()

  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed2'), true, g().status)
  const csink = {
    id: 'hc',
    type: 'hole',
    kind: 'countersink',
    center: [20, 15],
    top: 20,
    diameter: 6,
    through: true,
    extent: 'through-all',
    countersink: { diameter: 12, angle: 90 },
  }
  assert.equal(await g().applyFeatures([BOX, csink], 'csink thru'), true, g().status)
  const vCs = await vol()

  assert.ok(vSimple < v0 - 10, `simple through cuts: ${v0} → ${vSimple}`)
  assert.ok(vCs < v0 - 10, `countersink through cuts: ${v0} → ${vCs}`)
  // Cone recess removes extra material vs drill-only of same Ø
  assert.ok(vCs < vSimple - 1, `csink Ø12 should cut more than simple Ø6: simple=${vSimple} csink=${vCs}`)
  assert.doesNotMatch(g().status, /尺寸已拒絕/)
  assert.ok(g().features.some((f) => f.type === 'hole' && f.kind === 'countersink'))
})

test('runtime: commitHole UI path countersink+through changes volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = g().bodyMesh?.volumeExact ?? (await vol())
  useApp.setState({
    holeMode: true,
    holePos: [20, 10, 0],
    holeFaceZ: 20,
    holeD: 6,
    holeThrough: true,
    holeType: 'countersink',
    holeCsD: 11,
    holeCsAngle: 90,
    holeClearance: 0,
  })
  await g().commitHole()
  assert.equal(g().holeMode, false, `commit should close; status=${g().status}`)
  const holeFeat = g().features.find((f) => f.type === 'hole')
  assert.ok(holeFeat, `hole feature added; status=${g().status}`)
  assert.equal(holeFeat.kind, 'countersink')
  assert.equal(holeFeat.through || holeFeat.extent === 'through-all', true)
  assert.ok(holeFeat.countersink?.diameter >= 10, `cs Ø ${holeFeat.countersink?.diameter}`)
  const v1 = g().bodyMesh?.volumeExact ?? (await vol())
  assert.ok(v1 < v0 - 10, `UI countersink commitHole must cut: ${v0} → ${v1}`)
})

test('runtime: blind countersink (through=false) still reduces volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  const blind = {
    id: 'hb',
    type: 'hole',
    kind: 'countersink',
    center: [20, 15],
    top: 20,
    diameter: 5,
    through: false,
    depth: 8,
    extent: 'distance',
    countersink: { diameter: 10, angle: 90 },
  }
  assert.equal(await g().applyFeatures([BOX, blind], 'blind csink'), true, g().status)
  const v1 = await vol()
  assert.ok(v1 < v0 - 5, `blind countersink must cut: ${v0} → ${v1}`)
  assert.ok(v1 > v0 * 0.5, `blind should not erase half the box: ${v1}`)
})
