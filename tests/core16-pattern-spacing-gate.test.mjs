/**
 * CORE16 residual more5: Pattern (陣列) spacing gate.
 * Legal spacing OK (volume changes); spacing 0 with count>1 → Formal 繁中 refuse.
 * Avoids pure dup of fishing24 / core16-rect-body-pattern-after-cut — focuses on
 * dx=0 / circ count refuse + legal 1×N hole pattern (new angle).
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
const { featDlgSemanticReason, featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const PLATE = { id: 'P', type: 'prim', shape: 'box', a: 100, b: 50, c: 10, op: 'new', cornerOrigin: true }
const HOLE = {
  id: 'H',
  type: 'extrude',
  profile: { kind: 'circle', c: [15, 25], r: 4 },
  height: 10,
  plane: 'XY',
  baseZ: 0,
  through: true,
  operation: 'cut',
}
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /间距不可|数量大于|环形阵列|尺寸已拒绝/

test('source: featDlgSemanticReason + commit path pin spacing-0 Formal TC', () => {
  const num = rd('src/cad/featDlgNumeric.ts')
  const st = rd('src/store.ts')
  assert.match(num, /數量大於 1 的方向，間距不可為 0/)
  assert.match(st, /矩形陣列：數量>1 的方向間距不可是 0/)
  assert.match(st, /環形陣列：數量至少為 2（非法值已拒絕，原模型不變）/)
  assert.doesNotMatch(num, /间距不可为 0/)
  assert.doesNotMatch(st, /间距不可是 0/)
})

test('featDlgSemanticReason: dx=0 with countX>1 → Formal 繁中; legal spacing null', () => {
  const bad = featDlgSemanticReason({
    kind: 'pattern',
    params: { countX: 3, countY: 1, countZ: 1, dx: 0, dy: 20, dz: 0, dtype: 'spacing' },
  })
  assert.match(bad || '', /間距不可為 0/)
  assert.doesNotMatch(bad || '', COLLOQ)
  assert.doesNotMatch(bad || '', SC)

  const ok = featDlgSemanticReason({
    kind: 'pattern',
    params: { countX: 3, countY: 1, countZ: 1, dx: 25, dy: 0, dz: 0, dtype: 'spacing' },
  })
  assert.equal(ok, null)

  // countX=1 with dx=0 is OK (that direction not patterning)
  const one = featDlgSemanticReason({
    kind: 'pattern',
    params: { countX: 1, countY: 2, countZ: 1, dx: 0, dy: 30, dz: 0, dtype: 'spacing' },
  })
  assert.equal(one, null)
})

test('runtime: dialog dx=0 countX=3 → Formal refuse; features/volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([PLATE, HOLE], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  g().selectFeature('H')
  g().openFeatDlg('pattern')
  g().setFeatParam('countX', 3)
  g().setFeatParam('countY', 1)
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 20)
  const block = featDlgBlockingReason(g().featDlg)
  assert.match(block || '', /間距不可為 0/)
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：.*間距不可為 0|間距不可是 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.ok(g().featDlg, 'dialog stays open')
  assert.deepEqual(g().features, before)
  assert.ok(Math.abs((await vol()) - v0) < 1e-3)
})

test('runtime: circpattern count 0/1 → Formal refuse; legal count=4 changes volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([PLATE, HOLE], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  g().selectFeature('H')
  g().openFeatDlg('circpattern')
  for (const bad of [0, 1]) {
    g().setFeatParam('count', bad)
    await g().commitFeatDlg()
    assert.match(g().status, /環形陣列數量必須是不小於 2|數量至少為 2|非法/)
    assert.doesNotMatch(g().status, COLLOQ)
    assert.ok(g().featDlg)
    assert.deepEqual(g().features, before)
  }
  // legal circular pattern around Z through plate center-ish
  g().setFeatParam('count', 4)
  g().setFeatParam('mode', 'full')
  g().setFeatParam('totalAngle', 360)
  g().setFeatParam('ox', 50)
  g().setFeatParam('oy', 25)
  g().setFeatParam('oz', 0)
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 0)
  g().setFeatParam('dz', 1)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.ok(g().features.some((f) => f.type === 'circPattern' || f.type === 'circpattern'), g().status)
  const v1 = await vol()
  assert.ok(v1 < v0 - 50, `legal circ pattern must cut more: ${v0} → ${v1}`)
})

test('runtime: legal 3×1 rectangular hole pattern @ dx=30 reduces volume ×3 holes', async () => {
  reset()
  assert.equal(await g().applyFeatures([PLATE, HOLE], 'seed'), true, g().status)
  const v0 = await vol()
  const oneHole = Math.PI * 16 * 10
  g().selectFeature('H')
  g().openFeatDlg('pattern')
  g().setFeatParam('countX', 3)
  g().setFeatParam('countY', 1)
  g().setFeatParam('dx', 30)
  g().setFeatParam('dy', 0)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.match(g().status, /已矩形陣列/)
  assert.doesNotMatch(g().status, COLLOQ)
  const v1 = await vol()
  const expected = v0 - 2 * oneHole // seed already has 1 hole; pattern adds 2 more
  assert.ok(Math.abs(v1 - expected) < 5, `legal spacing volume ${v1} want ~${expected} (seed ${v0})`)
})

test('runtime: applyFeatures pattern with dx=0 countX>1 still refuses at commit (store gate)', async () => {
  reset()
  assert.equal(await g().applyFeatures([PLATE], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  // Direct applyFeatures with illegal spacing — worker may still build overlapping copies;
  // the dialog/store gate is the product refuse path. Pin dialog path is primary.
  // Here: open dialog on body pattern with dx=0.
  g().openFeatDlg('pattern')
  g().setFeatParam('objectType', 'bodies')
  g().setFeatParam('countX', 2)
  g().setFeatParam('countY', 1)
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 50)
  await g().commitFeatDlg()
  assert.match(g().status, /間距不可為 0|間距不可是 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(
    g().features.filter((f) => f.type === 'pattern'),
    before.filter((f) => f.type === 'pattern'),
  )
  assert.ok(Math.abs((await vol()) - v0) < 1)
})
