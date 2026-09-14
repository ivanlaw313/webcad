/**
 * v1.24: Shell soft bilingual status; planarSameZ before cavity; component-boolean
 * primary statusAction bake; Fillet dead-end MeshFit one-click hint.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.24+ (superseded by later ship)', () => {
  assert.match(version, /APP_VERSION = '1\.(2[4-9]|[3-9]\d)'/)
})

test('shell soft status uses full bilingual phrases (no 抽殼done mangling)', () => {
  assert.match(worker, /抽壳完成（备用：直柱型腔）/)
  assert.match(worker, /抽壳完成（备用：开口面偏移型腔）/)
  assert.doesNotMatch(worker, /抽殼完成（备用重建/)
  assert.match(i18n, /Shell done \(fallback: prismatic cavity\)/)
  assert.match(i18n, /Shell done \(fallback: opening-face offset cavity\)/)
  assert.match(i18n, /Shell: primary opening OCCT did not converge/)
  // Full phrases must exist so short 完成/重建 fragments cannot mangle them first.
  assert.match(i18n, /'抽壳完成（备用：直柱型腔）'/)
})

test('v1.24 planarSameZ OCCT before cavity (G1 chain still deferred)', () => {
  assert.match(worker, /v1\.24: coplanar same-Z planar seeds via tryBases BEFORE cavity/)
  assert.match(worker, /抽壳：已用共面开口集合完成/)
  const beforeCavity = worker.indexOf('coplanar same-Z planar seeds via tryBases BEFORE cavity')
  const cavity = worker.indexOf('Seeds-only miss → cavity/prismatic BEFORE G1 chain')
  assert.ok(beforeCavity >= 0 && cavity > beforeCavity, 'planarSameZ step must precede cavity')
  assert.match(worker, /alternate planar lids \(NOT G1 chain\) before cavity/)
  assert.match(worker, /_copyHealSolid/)
})

test('componentBoolean bake is primary statusAction (no blocking confirm)', () => {
  const start = store.indexOf('componentBoolean: async')
  const end = store.indexOf('planeCutComponent: async')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /bakeMeshToPart/)
  assert.match(block, /烘焙为零件实体/)
  assert.match(block, /点右侧按钮烘焙入零件后即可圆角\/抽壳/)
  assert.doesNotMatch(block, /appConfirm/)
  assert.match(store, /runStatusAction/)
  assert.match(store, /statusAction:/)
})

test('Fillet/Shell dead-end sets MeshFit statusAction one-click hint', () => {
  assert.match(store, /function partSolidRequiredPatch/)
  assert.match(store, /id: 'meshfit'/)
  assert.match(store, /MeshFit \/ 转 B-rep/)
  assert.match(store, /partSolidRequiredPatch\('圆角'/)
  assert.match(store, /partSolidRequiredPatch\('抽壳'/)
})

test('Viewport renders statusAction button', () => {
  assert.match(viewport, /data-testid="status-action"/)
  assert.match(viewport, /runStatusAction/)
  assert.match(viewport, /statusAction/)
})

// Runtime: soft BX02 path still rebuilds; bilingual soft wording if cavity used
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const cavityRe = /开口面偏移型腔|直柱型腔|备用：/
const failAlarmRe = /OCCT 抽壳失败|抽壳失败/
const mangledRe = /抽殼done|备用rebuild|opening面Offset/

const boxCut = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-25, -20], b: [25, 20] }, height: 25, operation: 'new' }
const cylCut = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [10, 0], r: 10 }, height: 30, operation: 'newbody' }
const bbCut = { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 }

test('BX02-like: cut+fillet+shell rebuilds; soft wording clean if fallback', async () => {
  const fillet = { id: 'f', type: 'fillet', radius: 1, nears: [[20, 10, 0]], chain: false }
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 25]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, fillet, shell])
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => failAlarmRe.test(x)), `no 失败 alarm; warnings=${JSON.stringify(warnings)}`)
  assert.ok(!warnings.some((x) => mangledRe.test(x)), `no mangled EN; warnings=${JSON.stringify(warnings)}`)
  const usedSoft = warnings.some((x) => cavityRe.test(x) || /共面开口|其他平面开口/.test(x))
  if (usedSoft) console.warn('v1.24 soft shell path:', warnings)
  else console.log('v1.24 prefer: OCCT clean')
})

test('control: cut no fillet shell stays OCCT (no cavity soft)', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 0]], tangentChain: false, direction: 'inside' }
  const m = await w.rebuild([boxCut, cylCut, bbCut, shell])
  assert.deepEqual(m.failed ?? [], [])
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => /备用：|开口面偏移型腔|直柱型腔/.test(x)), `control must stay OCCT; warnings=${JSON.stringify(warnings)}`)
})
