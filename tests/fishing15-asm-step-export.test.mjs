// FISHING15 P2：裝配根 File ▸ 匯出 STEP 須匯出全部組件實體（世界位姿）；空裝配 Formal TC 拒絕。
// P3：干涉面板標題——全部為接觸（vol=0）時標「接觸 N 處」，唔好「干涉 N 處」。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('exportStep at assembly root with visible components delegates to exportAssemblyStep', () => {
  const start = store.indexOf('exportStep: async () => {')
  assert.ok(start > 0, 'exportStep present')
  const body = store.slice(start, start + 900)
  assert.match(body, /atAsmRoot|editingComponent/, 'detects assembly root')
  assert.match(body, /exportAssemblyStep\(\)/, 'routes to assembly STEP')
  assert.match(body, /沒有可匯出的實體，請先建模/, 'single-body refuse is Formal TC')
})

test('exportAssemblyStep resolves features from componentDefs and Formal-TC refuses empty asm', () => {
  const start = store.indexOf('exportAssemblyStep: async () => {')
  assert.ok(start > 0)
  const body = store.slice(start, start + 4500)
  assert.match(body, /featsOf/, 'resolves feats from occ.src or componentDefs')
  assert.match(body, /componentDefs\.find/, 'falls back to shared def features')
  assert.match(body, /沒有可匯出的實體，請先建模/, 'empty asm Formal TC refuse')
  assert.match(body, /compWorldMatrix/, 'places parts in world poses')
})

test('interference panel title prefers contact wording when all hit volumes are 0', () => {
  assert.match(vp, /const volN = interfReport\.hits\.filter/, 'splits volume vs contact hits')
  assert.match(vp, /tStatus\('接觸', lang\)\} \$\{contactN\}/, 'contact-only title')
  assert.doesNotMatch(
    vp,
    /interfReport\.hits\.length \? `⚠ \$\{tStatus\('干涉', lang\)\} \$\{interfReport\.hits\.length\}/,
    'old title that counted contacts as interference is gone',
  )
})

test('store: empty assembly exportStep / exportAssemblyStep → Formal TC refuse', async () => {
  await import('../src/worker/cad.worker.ts')
  const { useApp } = await import('../src/store.ts')
  useApp.setState({
    ...useApp.getInitialState(),
    components: [{ id: 'C1', name: '空件', mesh: { vertices: [], triangles: [], normals: [] }, pos: [0, 0, 0], rot: [0, 0, 0] }],
    componentDefs: [],
    features: [],
    bodyMesh: null,
    editingComponent: null,
    joints: [],
    projectName: '空裝配',
  }, true)
  await useApp.getState().exportAssemblyStep()
  assert.match(useApp.getState().status, /沒有可匯出的實體，請先建模/)
  await useApp.getState().exportStep()
  assert.match(useApp.getState().status, /沒有可匯出的實體，請先建模/)
})

test('kernel: exportAssemblySTEP writes multi-body STEP for two posed boxes', async () => {
  await import('../src/worker/cad.worker.ts')
  const worker = globalThis.__wheelWorker
  await worker.ready()
  const boxFeats = (id, dx, dy, dz) => ([
    { id: id + 's', type: 'sketch', plane: 'XY', shapes: [{ type: 'rect', a: [0, 0], b: [dx, dy] }] },
    { id: id + 'e', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [dx, dy] }, height: dz, operation: 'new' },
  ])
  const parts = [
    { name: '組件1', trsf: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], features: boxFeats('a', 40, 30, 10) },
    { name: '組件2', trsf: [1, 0, 0, 50, 0, 1, 0, 0, 0, 0, 1, 0], features: boxFeats('b', 20, 20, 20) },
  ]
  const res = await worker.exportAssemblySTEP('FISH15', parts)
  assert.ok(res && res.buf && res.buf.byteLength > 500, 'STEP buffer')
  assert.deepEqual(res.exported, ['組件1', '組件2'])
  assert.match(new TextDecoder().decode(res.buf), /ISO-10303-21/)
})
