/**
 * CORE16 residual more17: Two-distance (雙距離) chamfer legal commit changes volume.
 * Complements core16-chamfer-dist2-zero-refuse (dist2=0 gate) and
 * chamfer-two-distance-kernel (applyFeatures path) with commitEdgeRound UI path
 * asserting measurable volume delta for legal d1×d2.
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
const { useApp, chamferInputReason } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () =>
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 40, c: 40, op: 'new', cornerOrigin: true }
// Top front edge mid (cornerOrigin): CAD (20,0,40) → three (20,40,0)
const TOP_FRONT_THREE = [[20, 40, 0]]
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

test('source: 雙距離 mode enabled; dist2>0 gate allows legal commit', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.doesNotMatch(st, /雙距離倒角暫未支援/)
  assert.match(
    st,
    /if \(kind === 'chamfer' && get\(\)\.chamferMode === 'two' && !\(get\(\)\.chamferSize2 > 0\)\)/,
  )
  assert.match(vp, /<option value="two">雙距離<\/option>/)
  assert.equal(
    chamferInputReason({ edgeRoundSize: 3, chamferMode: 'two', chamferSize2: 8 }),
    null,
  )
})

test('runtime: commitEdgeRound two-dist C3×8 changes volume by ~½·d1·d2·L', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  assert.ok(Math.abs(v0 - 64000) < 2, `box vol ${v0}`)

  useApp.setState({
    edgeRoundPick: 'chamfer',
    edgeRoundPicks: TOP_FRONT_THREE,
    edgeRoundPickLines: [],
    edgeRoundRadii: [],
    edgeRoundGroupIds: [],
    edgeRoundSize: 3,
    chamferMode: 'two',
    chamferSize2: 8,
    chamferAngle: 45,
    chamferFlip: false,
    chamferRefFace: null,
  })
  await g().commitEdgeRound()
  assert.ok(
    g().features.some((f) => f.type === 'chamfer' && f.cmode === 'two'),
    `two-dist chamfer missing; status=${g().status}`,
  )
  const f = g().features.find((x) => x.type === 'chamfer')
  assert.equal(f.distance, 3)
  assert.equal(f.dist2, 8)
  assert.doesNotMatch(g().status, COLLOQ)

  const v1 = await vol()
  // ½·3·8·40 = 480 → expected ~63520
  const expected = v0 - 480
  assert.ok(
    Math.abs(v1 - expected) < 12,
    `legal two-dist must change volume: v0=${v0} v1=${v1} expected≈${expected}`,
  )
  assert.ok(v1 < v0 - 200, `volume must drop materially: Δ=${v0 - v1}`)
})

test('runtime: applyFeatures two-dist C3×5 also changes volume (kernel pin)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  assert.equal(
    await g().applyFeatures(
      [
        BOX,
        {
          id: 'ct',
          type: 'chamfer',
          distance: 3,
          dist2: 5,
          nears: [[20, 0, 40]],
          cmode: 'two',
          chain: false,
          flip: false,
        },
      ],
      'two5',
    ),
    true,
    g().status,
  )
  const v1 = await vol()
  // ½·3·5·40 = 300
  assert.ok(Math.abs(v1 - (v0 - 300)) < 12, `C3×5 vol ${v1} from ${v0}`)
  assert.ok(v1 < v0 - 100)
})

test('runtime: equal C3 vs two C3×8 volumes differ (asymmetric not silent-equal)', async () => {
  reset()
  assert.equal(
    await g().applyFeatures(
      [BOX, { id: 'ce', type: 'chamfer', distance: 3, nears: [[20, 0, 40]], cmode: 'equal', chain: false }],
      'eq',
    ),
    true,
    g().status,
  )
  const ve = await vol()
  assert.equal(
    await g().applyFeatures(
      [
        BOX,
        {
          id: 'ct',
          type: 'chamfer',
          distance: 3,
          dist2: 8,
          nears: [[20, 0, 40]],
          cmode: 'two',
          chain: false,
        },
      ],
      'two',
    ),
    true,
    g().status,
  )
  const vt = await vol()
  assert.ok(Math.abs(vt - ve) > 200, `asymmetric must differ from equal: ${vt} vs ${ve}`)
})
