/**
 * CORE16 residual more12: Cone / Cylinder after CREATE —
 * Timeline Formal labels (圓柱／圓錐, never「拉伸」) + volume sample.
 * Complements core16-cylinder-cone-timeline-label (source/label helpers) with
 * runtime commitFeatDlg → featureKindLabel + STEP measureVolume.
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
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const {
  featureKindLabel,
  isCylinderPrimitive,
  isConePrimitive,
} = await import('../src/ui/featureLabel.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

const vol = async () => {
  const buf = await globalThis.__wheelWorker.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}

async function createPrim(kind, params) {
  useApp.setState({
    lang: 'zh-HK',
    featDlg: { kind, params: { op: 'new', px: 0, py: 0, pz: 0, ...params } },
  })
  await g().commitFeatDlg()
  return g().features.at(-1)
}

test('source: Timeline / featureLabel Formal 圓柱／圓錐 wired', () => {
  const tl = rd('src/components/Timeline.tsx')
  const fl = rd('src/ui/featureLabel.ts')
  assert.match(tl, /featureKindLabel/)
  assert.match(fl, /return '圓柱'/)
  assert.match(fl, /return '圓錐'/)
  assert.doesNotMatch(fl, /return '圆柱'|return '圆锥'/)
})

test('runtime: create cylinder → featureKindLabel 圓柱 + volume ≈ π r² h', async () => {
  reset()
  const d = 20, h = 30
  const f = await createPrim('cylinder', { d, h })
  assert.ok(f, g().status)
  assert.equal(isCylinderPrimitive(f), true, JSON.stringify(f))
  const label = featureKindLabel(f, '拉伸')
  assert.equal(label, '圓柱')
  assert.doesNotMatch(label, /拉伸/)
  assert.match(g().status, /圓柱|Ø/)
  assert.doesNotMatch(g().status, /拉伸/)
  assert.doesNotMatch(g().status, COLLOQ)
  const v = await vol()
  const expect = Math.PI * (d / 2) ** 2 * h
  assert.ok(Math.abs(v - expect) < 5, `cyl vol ${v} vs ${expect}`)
})

test('runtime: create cone → featureKindLabel 圓錐 + volume ≈ ⅓ π r² h', async () => {
  reset()
  const d = 20, h = 30, dt = 0
  const f = await createPrim('cone', { d, dt, h })
  assert.ok(f, g().status)
  assert.equal(f.type, 'prim')
  assert.equal(f.shape, 'cone')
  assert.equal(isConePrimitive(f), true, JSON.stringify(f))
  const label = featureKindLabel(f, '原語')
  assert.equal(label, '圓錐')
  assert.doesNotMatch(label, /拉伸|原語/)
  assert.match(g().status, /圓錐|錐/)
  assert.doesNotMatch(g().status, COLLOQ)
  const v = await vol()
  const expect = (1 / 3) * Math.PI * (d / 2) ** 2 * h
  assert.ok(Math.abs(v - expect) < 8, `cone vol ${v} vs ${expect}`)
})

test('runtime: cylinder then cone labels stay Formal; volumes independent (newbody)', async () => {
  reset()
  const cyl = await createPrim('cylinder', { d: 16, h: 20 })
  assert.equal(featureKindLabel(cyl, '拉伸'), '圓柱')
  const v1 = await vol()
  const expectCyl = Math.PI * 8 ** 2 * 20
  assert.ok(Math.abs(v1 - expectCyl) < 5, `cyl1 ${v1}`)

  // Second solid as newbody so volumes don't fuse
  useApp.setState({
    featDlg: {
      kind: 'cone',
      params: { op: 'newbody', d: 20, dt: 0, h: 30, px: 100, py: 0, pz: 0 },
    },
  })
  await g().commitFeatDlg()
  const cone = g().features.at(-1)
  assert.equal(featureKindLabel(cone, '原語'), '圓錐')
  // Active body is cone after newbody; parked holds cylinder
  const vCone = await vol()
  const expectCone = (1 / 3) * Math.PI * 10 ** 2 * 30
  assert.ok(Math.abs(vCone - expectCone) < 8, `active cone vol ${vCone} vs ${expectCone}`)
  assert.ok((g().bodyMesh?.parked?.length ?? 0) >= 1, 'cylinder parked as newbody sibling')
})
