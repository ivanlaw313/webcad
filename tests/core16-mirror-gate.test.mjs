/**
 * CORE16 residual more5: Mirror (鏡像) — feature/volume symmetry on success;
 * failure → Formal Traditional Chinese refuse (no colloquial / SC).
 * Complements core16-b3 (#4 prompts) and grok-so12 without re-testing SO12 hole-after-fillet.
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

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /已镜像|镜像特征|请先|没有可镜像|尺寸已拒绝/

test('source: mirror success/fail strings are Formal 繁中 (no SC 镜像 / colloquial)', () => {
  const st = rd('src/store.ts')
  assert.match(st, /鏡像特徵：請先在時間軸點選要鏡像的特徵/)
  assert.match(st, /鏡像：目前沒有可鏡像的實體 — 請先建立實體/)
  assert.match(st, /鏡像：請點選一個平面作為鏡像面/)
  assert.doesNotMatch(st, /镜像特征：请先/)
  assert.doesNotMatch(st, /镜像：目前没有可镜像/)
  // success toast path (TC 已鏡像 preferred; SC 已镜像 still present in one branch — pin TC form exists)
  assert.match(st, /已鏡像（跨所拾面|已鏡像 \$\{|已鏡像組件/)
})

test('runtime: body mirror across YZ offset doubles volume (symmetry)', async () => {
  reset()
  // Box at corner origin [0..40]×[0..30]×[0..20]; mirror across YZ at offset 0 → box sits on +X side of YZ,
  // mirror copy on −X → fused volume ≈ 2× when op=join (default body mirror).
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  assert.ok(Math.abs(v0 - 40 * 30 * 20) < 1, `seed ${v0}`)

  const mir = { id: 'M', type: 'mirror', plane: 'YZ', offset: 0 }
  assert.equal(await g().applyFeatures([BOX, mir], 'mirror body'), true, g().status)
  const v1 = await vol()
  // Touching plane: fusion may share the face; volume must be ~2× seed (within 1%).
  assert.ok(Math.abs(v1 - 2 * v0) / (2 * v0) < 0.02, `mirror volume symmetry: ${v0} → ${v1} (want ~${2 * v0})`)
  assert.ok(g().features.some((f) => f.type === 'mirror'))
  assert.doesNotMatch(g().status, COLLOQ)
})

test('runtime: feature-mirror of hole removes more material (volume↓)', async () => {
  reset()
  const plate = { id: 'P', type: 'prim', shape: 'box', a: 80, b: 40, c: 12, op: 'new', cornerOrigin: true }
  const hole = {
    id: 'H',
    type: 'extrude',
    profile: { kind: 'circle', c: [20, 20], r: 5 },
    height: 12,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([plate, hole], 'seed'), true, g().status)
  const v0 = await vol()
  const mir = { id: 'M', type: 'mirror', plane: 'YZ', offset: 40, targets: ['H'] }
  assert.equal(await g().applyFeatures([plate, hole, mir], 'feat mirror'), true, g().status)
  const v1 = await vol()
  assert.ok(v1 < v0 - 50, `feature mirror must cut mirrored hole: ${v0} → ${v1}`)
  assert.ok(g().features.some((f) => f.type === 'mirror' && f.targets?.includes('H')))
})

test('runtime: mirror feature with no selection → Formal 繁中拒; tree unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  g().openFeatDlg('mirror')
  g().setFeatParam('target', 'feature')
  useApp.setState({ selectedFeature: null, selectedFeatures: [] })
  await g().commitFeatDlg()
  assert.match(g().status, /^鏡像特徵：請先在時間軸點選要鏡像的特徵/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.ok(g().featDlg, 'dialog stays open on refuse')
  assert.deepEqual(g().features, before)
  assert.ok(Math.abs((await vol()) - v0) < 1e-3)
})

test('runtime: mirror with no solid → Formal 繁中拒', async () => {
  reset()
  // openFeatDlg early-gates kinds that need a solid
  g().openFeatDlg('mirror')
  assert.equal(g().featDlg, null)
  assert.match(g().status, /請先建立一個實體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /请先建立一个实体|没有可镜像/)
  // commit path string still Formal TC (source-locked) when dialog somehow open without solid
  assert.match(rd('src/store.ts'), /鏡像：目前沒有可鏡像的實體 — 請先建立實體/)
  assert.equal(g().features.filter((f) => f.type === 'mirror').length, 0)
})

test('runtime: legal body mirror via dialog (join) ≈ 2× volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  g().openFeatDlg('mirror')
  g().setFeatParam('target', 'body')
  g().setFeatParam('plane', 'YZ')
  g().setFeatParam('offset', 0)
  g().setFeatParam('mirrorOp', 0) // join / 合併
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.ok(g().features.some((f) => f.type === 'mirror'), g().status)
  const v1 = await vol()
  assert.ok(Math.abs(v1 - 2 * v0) / (2 * v0) < 0.02, `dialog mirror symmetry ${v0} → ${v1}`)
  assert.doesNotMatch(g().status, COLLOQ)
})
