// Re-open verification: a real project saved from the live site (檔案 → 儲存檔案,
// R3-fillet plate, 19.90 cm³, 草圖+拉伸+圓角, timeline 3/3) must restore through the
// same applyProjectData path that 開啟舊檔案 / drag-drop use, and a save→open roundtrip
// (buildProjectPayload, the 儲存檔案 serializer) must reproduce the same document.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, buildProjectPayload } = await import('../src/store.ts')
const g = () => useApp.getState()

const FIXTURE = readFileSync(new URL('./fixtures/roundtrip-fillet-plate.json', import.meta.url), 'utf8')

const meshVolume = (m) => {
  const v = m?.vertices, t = m?.triangles ?? m?.indices
  if (!v || !t) return NaN
  let vol = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    vol += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6
  }
  return Math.abs(vol)
}
const cm3 = (m) => meshVolume(m) / 1000

function freshDoc() {
  useApp.setState(useApp.getInitialState(), true)
  let confirms = 0
  useApp.setState({ appConfirm: async () => { confirms++; return true } })
  return () => confirms
}

function assertRestored(label) {
  const s = g()
  assert.deepEqual(s.features.map(f => f.type), ['sketch', 'extrude', 'fillet'], `${label}: feature types (${s.status})`)
  assert.equal(s.timelinePos, 3, `${label}: timeline at end`)
  assert.equal(s.timelinePos, s.features.length)
  assert.deepEqual(s.failedFeatureIds ?? [], [], `${label}: no failed features`)
  const ex = s.features[1]
  assert.equal(ex.height, 10)
  assert.equal(ex.operation, 'new')
  assert.deepEqual(ex.profile, { kind: 'rect', a: [-105, 25], b: [-55, -15] })
  const fi = s.features[2]
  assert.equal(fi.radius, 3)
  assert.equal(fi.nears.length, 1)
  assert.ok(s.sketchSources.sk11, `${label}: sketch source restored`)
  assert.equal(s.sketchSources.sk11.shapes[0].type, 'rect')
  assert.equal(s.sketchSources.sk11.cons.length, 4)
  assert.equal(s.projectName, '未命名零件')
  assert.equal(s.bodyColor, '#e6b800')
  assert.equal(s.bodyDensity, 19.3)
  const vol = cm3(s.bodyMesh)
  assert.ok(Math.abs(vol - 19.90) <= 0.05, `${label}: volume ${vol.toFixed(4)} cm³ ≈ 19.90`)
  return vol
}

test('saved live-site project (R3 fillet plate) re-opens into an empty document', async () => {
  const confirms = freshDoc()
  await g().applyProjectData(JSON.parse(FIXTURE))
  const vol = assertRestored('fixture')
  assert.equal(confirms(), 0, 'empty doc must not prompt')
  assert.match(g().status, /^已打開項目/, g().status)
  // the fillet must actually remove material vs. the plain 50×40×10 plate (20 cm³)
  assert.ok(vol < 19.95 && vol > 19.85, `fillet applied: ${vol}`)
  console.log(`# fixture restored: ${g().features.length} features, timeline ${g().timelinePos}/${g().features.length}, volume ${vol.toFixed(4)} cm³`)
})

test('in-process save→open roundtrip (buildProjectPayload, same as 儲存檔案) reproduces the doc', async () => {
  freshDoc()
  await g().applyProjectData(JSON.parse(FIXTURE))
  const v0 = cm3(g().bodyMesh)
  const saved = JSON.stringify({ ...buildProjectPayload(g()) }, null, 2)
  const feats0 = JSON.parse(JSON.stringify(g().features))
  const srcs0 = JSON.parse(JSON.stringify(g().sketchSources))
  // reopen in a fresh tab
  freshDoc()
  await g().applyProjectData(JSON.parse(saved))
  const v1 = assertRestored('roundtrip')
  assert.deepEqual(JSON.parse(JSON.stringify(g().features)), feats0, 'features identical after roundtrip')
  assert.deepEqual(JSON.parse(JSON.stringify(g().sketchSources)), srcs0, 'sketch sources identical after roundtrip')
  assert.ok(Math.abs(v1 - v0) < 1e-6, `volume stable ${v0} → ${v1}`)
  // second save is byte-identical (stable serializer)
  assert.equal(JSON.stringify({ ...buildProjectPayload(g()) }, null, 2), saved, 'save is idempotent')
})

test('re-open over a non-empty doc asks to confirm, and replaces cleanly', async () => {
  const confirms = freshDoc()
  await g().applyProjectData(JSON.parse(FIXTURE))
  await g().applyProjectData(JSON.parse(FIXTURE))
  assert.equal(confirms(), 1)
  assertRestored('reopen-over')
})

// ── Job B: open-path robustness ───────────────────────────────────────────────
const { isQuickPickerAbort, QUICK_PICKER_ABORT_MS } = await import('../src/store.ts')

function withFakeDom(pickerImpl, fn) {
  const prevWin = globalThis.window, prevDoc = globalThis.document
  const inputs = []
  globalThis.window = { ...(prevWin ?? {}), showOpenFilePicker: pickerImpl }
  globalThis.document = {
    ...(prevDoc ?? {}),
    createElement: (tag) => {
      const el = { tag, files: null, clicked: 0, listeners: {}, click() { this.clicked++ }, addEventListener(t, f) { this.listeners[t] = f } }
      inputs.push(el)
      return el
    },
  }
  return fn(inputs).finally(() => { globalThis.window = prevWin; globalThis.document = prevDoc })
}
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms))
const abortErr = () => Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })

test('isQuickPickerAbort threshold', () => {
  assert.equal(QUICK_PICKER_ABORT_MS, 250)
  assert.equal(isQuickPickerAbort(1000, 1100), true)
  assert.equal(isQuickPickerAbort(1000, 1249), true)
  assert.equal(isQuickPickerAbort(1000, 1250), false)
  assert.equal(isQuickPickerAbort(1000, 5000), false)
})

test('instant AbortError from showOpenFilePicker falls back to <input type=file> and opens the picked file', async () => {
  freshDoc()
  await withFakeDom(async () => { throw abortErr() }, async (inputs) => {
    g().openProject()
    await tick(20)
    assert.equal(inputs.length, 1, 'fallback <input> created')
    assert.equal(inputs[0].type, 'file')
    assert.equal(inputs[0].clicked, 1)
    assert.doesNotMatch(g().status ?? '', /已取消打開/)
    inputs[0].files = [{ name: 'plate.json', text: async () => FIXTURE }]
    await inputs[0].onchange()
    assertRestored('quick-abort fallback')
  })
})

test('a slow (human) AbortError still reports cancel and leaves the model untouched', async () => {
  freshDoc()
  await g().applyProjectData(JSON.parse(FIXTURE))
  const before = g().features
  await withFakeDom(() => new Promise((_, rej) => setTimeout(() => rej(abortErr()), 300)), async (inputs) => {
    g().openProject()
    await tick(400)
    assert.equal(inputs.length, 0, 'no fallback input after a real cancel')
    assert.equal(g().status, '已取消打開（現有模型未動）')
    assert.equal(g().features, before)
  })
})

test('dropping a .json project onto the viewport opens it via applyProjectData', async () => {
  freshDoc()
  await g().acceptMeshDropFile({ name: '未命名零件 (26).json', text: async () => FIXTURE })
  assertRestored('drop')
  freshDoc()
  await g().acceptMeshDropFile({ name: 'broken.json', text: async () => '{not json' })
  assert.equal(g().status, '打開失敗：檔案格式不正確（現有模型未動）')
  assert.equal(g().features.length, 0)
})
