/**
 * CORE16 residual more3: Combine / Cut (合併／切割) two-body boolean.
 * Success → volume changes reasonably; failure → Formal 繁中.
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
const { booleanSuccessStatus } = await import('../src/ui/featureStatus.ts')
const { importSTEP, measureVolume } = await import('replicad')
const { computeMassProps } = await import('../src/cad/massProps.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const volSTEP = async () => {
  const buf = await w.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}
const meshVol = (m) => {
  if (!m?.vertices?.length || !m?.triangles?.length) return 0
  return computeMassProps(m.vertices, m.triangles).volume
}
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /已合并|已切除：活动|实体布尔|结果为空/

// 40×30×10 box at corner origin; second overlapping box via newbody path
const BOX1 = { id: 'b1', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
const PARK = { id: 'nb', type: 'newbody', name: '實體1' }
const BOX2 = { id: 'b2', type: 'prim', shape: 'box', a: 20, b: 20, c: 10, op: 'new', cornerOrigin: true } // overlaps [0,20]×[0,20]×[0,10]

async function twoBodySetup() {
  reset()
  assert.equal(await g().applyFeatures([BOX1, PARK, BOX2], 'two bodies'), true, g().status)
  assert.ok((g().bodyMesh?.parked?.length ?? 0) >= 1, 'need parked tool body')
  return { vActive: meshVol(g().bodyMesh), vParked: meshVol(g().bodyMesh.parked[0]) }
}

test('source: combine dialog + Formal success/fail TC wired', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(st, /openCombineDlg/)
  assert.match(st, /booleanSuccessStatus\(\{ kind: 'combine'/)
  assert.match(st, /合併：至少勾選一個工具體/)
  assert.match(st, /合併：沒有工具體/)
  assert.match(vp, /featDlg\.kind === 'combine'/)
  assert.match(vp, /<option value="fuse">\{tStatus\('＋合併', lang\)\}/)
  assert.match(vp, /<option value="cut">/)
  const fuse = booleanSuccessStatus({ kind: 'combine', op: 'join', toolCount: 1 }, 'zh-HK')
  const cut = booleanSuccessStatus({ kind: 'combine', op: 'cut', toolCount: 1 }, 'zh-HK')
  assert.match(fuse, /已合併/)
  assert.match(cut, /已/)
  assert.doesNotMatch(fuse + cut, COLLOQ)
  assert.doesNotMatch(fuse + cut, SC)
})

test('combine fuse (合併): two overlapping bodies → volume grows toward union', async () => {
  const { vActive, vParked } = await twoBodySetup()
  assert.ok(Math.abs(vActive - 20 * 20 * 10) < 1, `active BOX2 vol ${vActive}`)
  assert.ok(Math.abs(vParked - 40 * 30 * 10) < 1, `parked BOX1 vol ${vParked}`)
  g().openCombineDlg()
  assert.equal(g().featDlg?.kind, 'combine', g().status)
  g().setFeatParam('op', 'fuse')
  g().setFeatParam('tool0', 1)
  await g().commitFeatDlg()
  // Store calls booleanSuccessStatus without lang → node detectLang may be 'en'; accept EN or Formal TC
  assert.match(g().status, /已合併|Combined:.*unite|Combined:.*\+/, g().status)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().features.some((f) => f.type === 'bodyboolean' && f.bop === 'fuse'), g().status)
  const v = await volSTEP()
  // overlapping region 20×20×10 = 4000; union = 12000 + 4000 - 4000 = 12000? 
  // BOX1=12000, BOX2=4000, overlap = 20*20*10=4000 → union = 12000+4000-4000 = 12000
  // Wait: BOX2 is at origin 20×20×10 fully inside BOX1 40×30×10 → union = 12000
  assert.ok(Math.abs(v - 12000) < 5, `fuse union vol ${v} (expect ~12000)`)
  assert.equal(g().bodyMesh?.parked?.length ?? 0, 0, 'tool consumed by default')
})

test('combine cut (切割): tool cuts active → volume drops reasonably', async () => {
  // Active = large box, tool = smaller overlapping box parked first then swap via newbody order
  // Setup: BOX2 park, BOX1 active — cut active−tool
  reset()
  const small = { id: 's', type: 'prim', shape: 'box', a: 20, b: 20, c: 10, op: 'new', cornerOrigin: true }
  const park = { id: 'nb', type: 'newbody', name: '實體1' }
  const big = { id: 'big', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
  assert.equal(await g().applyFeatures([small, park, big], 'cut setup'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(Math.abs(v0 - 12000) < 1, `seed active ${v0}`)
  g().openCombineDlg()
  g().setFeatParam('op', 'cut')
  g().setFeatParam('tool0', 1)
  await g().commitFeatDlg()
  assert.match(g().status, /已|切割|切除|布爾|合併|Combined:.*cut|Combined:.*−/, g().status)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok(g().features.some((f) => f.type === 'bodyboolean' && f.bop === 'cut'), g().status)
  const v1 = await volSTEP()
  // big − small-overlap: small fully inside → 12000 − 4000 = 8000
  assert.ok(v1 < v0 - 1000, `cut must reduce volume: ${v0} → ${v1}`)
  assert.ok(Math.abs(v1 - 8000) < 50, `cut vol ${v1} expect ~8000`)
})

test('applyFeatures bodyboolean fuse/cut volume (worker path)', async () => {
  reset()
  const feats = [
    BOX1,
    PARK,
    { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [20, 15], r: 8 }, height: 10, operation: 'new' },
  ]
  assert.equal(await g().applyFeatures(feats, 'seed'), true, g().status)
  const v0 = meshVol(g().bodyMesh)
  const vPark = meshVol(g().bodyMesh.parked[0])
  assert.ok(v0 > 1000 && vPark > 1000)

  assert.equal(await g().applyFeatures([
    ...feats,
    { id: 'bb', type: 'bodyboolean', bop: 'fuse', target: 0 },
  ], 'fuse'), true, g().status)
  const vFuse = await volSTEP()
  assert.ok(vFuse > Math.max(v0, vPark) - 1, `fuse >= larger operand: ${vFuse}`)
  assert.ok(vFuse <= v0 + vPark + 1, `fuse <= sum: ${vFuse} vs ${v0 + vPark}`)
})

test('failure: openCombineDlg with no tool body → Formal 繁中; model unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX1], 'single'), true, g().status)
  const before = structuredClone(g().features)
  g().openCombineDlg()
  assert.equal(g().featDlg, null, 'no dialog without tool body')
  assert.match(g().status, /合併：沒有工具體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.deepEqual(g().features, before)
})

test('failure: combine with no tool checked → Formal 繁中; no bodyboolean feature', async () => {
  await twoBodySetup()
  // Force multi-tool path: add another parked body so default doesn't auto-check tool0
  // With 1 parked, openCombineDlg auto-checks tool0 — uncheck it.
  g().openCombineDlg()
  assert.equal(g().featDlg?.kind, 'combine')
  g().setFeatParam('tool0', 0)
  g().setFeatParam('op', 'fuse')
  const before = structuredClone(g().features)
  await g().commitFeatDlg()
  assert.match(g().status, /合併：至少勾選一個工具體/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().featDlg?.kind, 'combine', 'dialog stays open on refuse')
  assert.deepEqual(g().features, before)
  assert.ok(!g().features.some((f) => f.type === 'bodyboolean'))
})
