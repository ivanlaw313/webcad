/**
 * CORE16 residual more8: Insert Component / STEP failure → Formal 繁中, no crash.
 * Store API: importStep / insertWebcadPartJson / mapInsertComponentError.
 * Complements insert-component-json (pure helpers) with runtime refuse paths.
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

globalThis.requestAnimationFrame ??= (cb) => setTimeout(cb, 0)

const { useApp } = await import('../src/store.ts')
const {
  INSERT_COMPONENT_BAD_FILE,
  INSERT_COMPONENT_EMPTY,
  INSERT_COMPONENT_STEP_FAIL,
  mapInsertComponentError,
} = await import('../src/cad/insertComponentFile.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const ENG_KERNEL = /This shape|NullObject|Standard_Null|STEPCAFControl|has not type/i

test('constants + mapInsertComponentError: Formal TC, no English kernel leak', () => {
  assert.match(INSERT_COMPONENT_BAD_FILE, /無法插入/)
  assert.match(INSERT_COMPONENT_STEP_FAIL, /STEP／STP 匯入失敗/)
  assert.match(INSERT_COMPONENT_EMPTY, /沒有可插入/)
  for (const s of [INSERT_COMPONENT_BAD_FILE, INSERT_COMPONENT_STEP_FAIL, INSERT_COMPONENT_EMPTY]) {
    assert.doesNotMatch(s, COLLOQ)
    assert.doesNotMatch(s, ENG_KERNEL)
  }
  const m = mapInsertComponentError(new Error('This shape has not type, it is null'))
  assert.equal(m, INSERT_COMPONENT_BAD_FILE)
  assert.equal(mapInsertComponentError(new Error('STEPCAFControl_Reader failed')), INSERT_COMPONENT_STEP_FAIL)
})

test('source: importStep / insert paths map failures via Formal TC', () => {
  const st = rd('src/store.ts')
  assert.match(st, /mapInsertComponentError\(e\)/)
  assert.match(st, /INSERT_COMPONENT_STEP_FAIL/)
  assert.match(st, /INSERT_COMPONENT_BAD_FILE/)
  assert.match(st, /INSERT_COMPONENT_EMPTY/)
  assert.match(st, /importStep: async \(buf, name\)/)
  assert.match(st, /insertWebcadPartJson: async \(text, name\)/)
  assert.match(st, /case 'insertcomponent': return get\(\)\.openStepComponentDialog\(\)/)
})

test('runtime: importStep garbage buffer → Formal 繁中; no crash; no component added', async () => {
  reset()
  const beforeComps = g().components.length
  const beforeFeats = g().features.length
  const junk = new TextEncoder().encode('NOT-A-STEP-FILE <<<garbage>>>').buffer
  await assert.doesNotReject(() => g().importStep(junk, 'junk.step'))
  assert.match(g().status, /無法插入|STEP／STP 匯入失敗|匯入失敗/)
  assert.doesNotMatch(g().status, ENG_KERNEL)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().components.length, beforeComps, 'no component on fail')
  assert.equal(g().features.length, beforeFeats, 'features unchanged')
  assert.equal(g().busy, false, 'busy cleared after fail')
})

test('runtime: importStep empty ArrayBuffer → Formal STEP fail; no crash', async () => {
  reset()
  await assert.doesNotReject(() => g().importStep(new ArrayBuffer(0), 'empty.step'))
  assert.match(g().status, /無法插入|STEP／STP 匯入失敗/)
  assert.equal(g().components.length, 0)
  assert.equal(g().busy, false)
})

test('runtime: insertWebcadPartJson invalid JSON → Formal BAD_FILE; no crash', async () => {
  reset()
  await assert.doesNotReject(() => g().insertWebcadPartJson('{not-json', 'bad'))
  assert.equal(g().status, INSERT_COMPONENT_BAD_FILE)
  assert.equal(g().components.length, 0)
  assert.equal(g().busy, false)
})

test('runtime: insertWebcadPartJson empty features doc → Formal EMPTY; no crash', async () => {
  reset()
  const emptyDoc = JSON.stringify({ app: 'webcad', features: [], components: [] })
  await assert.doesNotReject(() => g().insertWebcadPartJson(emptyDoc, 'empty-part'))
  // Either EMPTY (no solids) or BAD_FILE if looksLikeWebcadDoc rejects — both Formal TC
  assert.match(g().status, /無法插入/)
  assert.doesNotMatch(g().status, ENG_KERNEL)
  assert.equal(g().components.length, 0)
  assert.equal(g().busy, false)
})
