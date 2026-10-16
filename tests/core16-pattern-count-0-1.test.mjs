/**
 * CORE16 residual more11: Pattern feature count 0 / 1 gates.
 * Rect countX/Y/Z=0 → Formal 繁中 refuse; count=1 legal for rect.
 * Circ count 0/1 → Formal refuse (≥2); legal count applies (ΔV).
 * Complements core16-pattern-spacing-gate (spacing-0 focus) without re-testing dx=0.
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
const { parseField } = await import('../src/cad/numericInput.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /阵列数量|必须是不小于|非法值已拒绝|尺寸已拒绝：阵列/
const RECT0 = /陣列數量必須是不小於 1 的整數/
const CIRC01 = /環形陣列數量必須是不小於 2 的整數/
const STORE_RECT = /矩形陣列：X\/Y\/Z 數量須為正整數/
const STORE_CIRC = /環形陣列：數量至少為 2（非法值已拒絕，原模型不變）/

test('source: pattern count 0/1 Formal TC pins (featDlg + store commit)', () => {
  const num = rd('src/cad/featDlgNumeric.ts')
  const st = rd('src/store.ts')
  const ni = rd('src/cad/numericInput.ts')
  assert.match(num, /陣列數量必須是不小於 1 的整數/)
  assert.match(num, /環形陣列數量必須是不小於 2 的整數/)
  assert.match(st, STORE_RECT)
  assert.match(st, STORE_CIRC)
  assert.match(ni, /patternCount: \{ label: '陣列數量', min: 1/)
  assert.doesNotMatch(num, /阵列数量必须是不小于/)
  assert.doesNotMatch(st, /数量至少为 2/)
})

test('featDlgSemanticReason: rect count 0 refuse; count 1 legal; circ 0/1 refuse', () => {
  const z = featDlgSemanticReason({
    kind: 'pattern',
    params: { countX: 0, countY: 1, countZ: 1, dx: 50, dy: 40, dz: 0, dtype: 'spacing' },
  })
  assert.match(z || '', RECT0)
  assert.doesNotMatch(z || '', COLLOQ)
  assert.doesNotMatch(z || '', SC)

  const one = featDlgSemanticReason({
    kind: 'pattern',
    params: { countX: 1, countY: 1, countZ: 1, dx: 50, dy: 40, dz: 0, dtype: 'spacing' },
  })
  assert.equal(one, null, 'rect count=1 is legal (no patterning that axis)')

  for (const bad of [0, 1]) {
    const c = featDlgSemanticReason({ kind: 'circpattern', params: { count: bad } })
    assert.match(c || '', CIRC01, `circ count ${bad}`)
    assert.doesNotMatch(c || '', COLLOQ)
  }
  assert.equal(featDlgSemanticReason({ kind: 'circpattern', params: { count: 4 } }), null)
})

test('paramRaw: count「0」→ Formal 尺寸已拒絕 (min 1); 「1」rect OK / circ blocked by semantic', () => {
  const r0 = parseField('patternCount', '0')
  assert.equal(r0.ok, false)
  assert.match(r0.reason || '', /陣列數量：最小 1（你打了「0」）/)
  assert.doesNotMatch(r0.reason || '', COLLOQ)
  assert.doesNotMatch(r0.reason || '', /阵列数量：最小/)

  const block0 = featDlgBlockingReason({
    kind: 'pattern',
    params: { countX: 0, countY: 2, dx: 50, dy: 40 },
    paramRaw: { countX: '0' },
  })
  assert.match(block0 || '', /陣列數量：最小 1|陣列數量必須是不小於 1/)
  assert.doesNotMatch(block0 || '', COLLOQ)

  // rect count 1 via raw is legal
  assert.equal(
    featDlgBlockingReason({
      kind: 'pattern',
      params: { countX: 1, countY: 2, dx: 50, dy: 40 },
      paramRaw: { countX: '1' },
    }),
    null,
  )

  // circ count 1: numeric min=1 OK, semantic ≥2 blocks
  const c1 = featDlgBlockingReason({
    kind: 'circpattern',
    params: { count: 1 },
    paramRaw: { count: '1' },
  })
  assert.match(c1 || '', CIRC01)
})

test('runtime: dialog rect countX=0 → Formal refuse; features/volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  g().openFeatDlg('pattern')
  g().setFeatParam('objectType', 'bodies')
  g().setFeatParam('countX', 0, '0')
  g().setFeatParam('countY', 1)
  g().setFeatParam('dx', 50)
  g().setFeatParam('dy', 40)
  const block = featDlgBlockingReason(g().featDlg)
  assert.match(block || '', /陣列數量：最小 1|陣列數量必須是不小於 1/)
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：.*陣列數量|尺寸已拒絕：.*陣列數量|X\/Y\/Z 數量須為正整數/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.ok(g().featDlg, 'dialog stays open on refuse')
  assert.deepEqual(g().features, before)
  assert.ok(Math.abs((await vol()) - v0) < 1e-3)
})

test('runtime: circpattern count 0 then 1 → Formal refuse; count=3 legal ΔV', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  g().openFeatDlg('circpattern')
  for (const bad of [0, 1]) {
    g().setFeatParam('count', bad, String(bad))
    await g().commitFeatDlg()
    assert.match(g().status, /環形陣列數量必須是不小於 2|數量至少為 2|非法|陣列數量：最小 1/)
    assert.doesNotMatch(g().status, COLLOQ)
    assert.ok(g().featDlg)
    assert.deepEqual(g().features, before)
  }
  g().setFeatParam('count', 3, '3')
  g().setFeatParam('mode', 'full')
  g().setFeatParam('totalAngle', 360)
  g().setFeatParam('ox', 0)
  g().setFeatParam('oy', 0)
  g().setFeatParam('oz', 0)
  g().setFeatParam('dx', 0)
  g().setFeatParam('dy', 0)
  g().setFeatParam('dz', 1)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.ok(g().features.some((f) => f.type === 'circPattern' || f.type === 'circpattern' || f.type === 'cpattern'), g().status)
  const v1 = await vol()
  // Seed at corner; 3× around Z through origin overlaps — volume must still change from seed.
  assert.ok(Math.abs(v1 - v0) > 1 || v1 > v0 * 1.5, `legal circ count must apply: ${v0} → ${v1}`)
})

test('runtime: legal rect 2×1 @ dx=50 grows volume (~2× body)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  g().openFeatDlg('pattern')
  g().setFeatParam('objectType', 'bodies')
  g().setFeatParam('countX', 2, '2')
  g().setFeatParam('countY', 1, '1')
  g().setFeatParam('dx', 50, '50')
  g().setFeatParam('dy', 40, '40')
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.match(g().status, /已矩形陣列/)
  assert.doesNotMatch(g().status, COLLOQ)
  const v1 = await vol()
  assert.ok(Math.abs(v1 - 2 * v0) / (2 * v0) < 0.05, `legal count volume ${v0} → ${v1} want ~${2 * v0}`)
})
