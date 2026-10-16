/**
 * CORE16 residual more17: Emboss text "AB" — preview flag + mesh exists.
 * Pins FEAT_DLG_DRY_PREVIEW_KINDS + previewFeatDlg / previewRound mesh for legal AB.
 * Complements core16-emboss-empty-depth-* (refuse gates) and advanced-emboss-preview.
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
const { loadFont } = await import('replicad')
const buf = readFileSync(new URL('../src/fonts/Roboto-Regular.ttf', import.meta.url))
await loadFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'cad', true)

const { useApp, FEAT_DLG_DRY_PREVIEW_KINDS } = await import('../src/store.ts')
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () =>
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

const BOX = {
  id: 'b',
  type: 'extrude',
  profile: { kind: 'rect', a: [-20, -15], b: [20, 15] },
  height: 10,
  operation: 'new',
}
const ARB = { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] }
const AB_TEXT = {
  id: 't',
  type: 'text',
  text: 'AB',
  size: 8,
  height: 1.5,
  op: 'new',
  arbPlane: ARB,
}

test('flag: emboss is in FEAT_DLG_DRY_PREVIEW_KINDS; legal AB clears blocking', () => {
  assert.ok(FEAT_DLG_DRY_PREVIEW_KINDS.has('emboss'), 'emboss dry-run preview kind flag')
  assert.equal(
    featDlgBlockingReason({
      kind: 'emboss',
      params: { text: 'AB', depth: 1.5, size: 8, mode: 'emboss' },
    }),
    null,
  )
  const st = rd('src/store.ts')
  assert.match(st, /FEAT_DLG_DRY_PREVIEW_KINDS\.has\(d\.kind\)[\s\S]{0,40}?featDlgBlockingReason\(d\)/)
  assert.match(st, /previewFeatDlg: async \(\) =>[\s\S]{0,2000}?editPreviewMesh: mesh/)
})

test('previewRound: AB emboss exposes mesh (triangles + volumeExact)', async () => {
  const pv = await w.previewRound([BOX, AB_TEXT])
  assert.ok(pv, 'previewRound returned mesh')
  assert.ok(pv.triangles?.length > 0, `preview mesh triangles ${pv.triangles?.length}`)
  assert.ok(pv.vertices?.length > 0, 'preview mesh vertices')
  assert.ok(pv.volumeExact > 0, `preview volumeExact ${pv.volumeExact}`)
  const base = await w.previewRound([BOX])
  assert.ok(
    pv.volumeExact > (base?.volumeExact ?? 0) + 0.2,
    `AB emboss adds volume: base=${base?.volumeExact} pv=${pv.volumeExact}`,
  )
})

test('previewFeatDlg: legal AB → editPreviewMesh / returned mesh exists', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'AB', depth: 1.5, size: 8, mode: 'emboss' },
      payload: { arbPlane: ARB },
    },
    editPreviewMesh: null,
  })
  assert.equal(featDlgBlockingReason(g().featDlg), null)
  const mesh = await g().previewFeatDlg()
  assert.ok(mesh, 'previewFeatDlg returns mesh for legal AB')
  assert.ok(mesh.triangles?.length > 0, 'preview mesh has triangles')
  const stored = g().editPreviewMesh
  assert.ok(stored, 'editPreviewMesh set after previewFeatDlg')
  assert.ok(stored.triangles?.length > 0, 'stored editPreviewMesh has triangles')
})

test('commitFeatDlg: legal AB emboss applies; bodyMesh remains', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = g().bodyMesh?.triangles?.length ?? 0
  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'AB', depth: 1.5, size: 8, mode: 'emboss' },
      payload: { arbPlane: ARB },
    },
  })
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.ok(
    g().features.some((f) => f.type === 'text' && f.text === 'AB'),
    `AB text feature missing; status=${g().status}`,
  )
  assert.ok(g().bodyMesh?.triangles?.length > 0, 'bodyMesh after AB emboss')
  assert.ok(
    (g().bodyMesh?.triangles?.length ?? 0) >= v0,
    'body mesh not emptied by emboss commit',
  )
})
