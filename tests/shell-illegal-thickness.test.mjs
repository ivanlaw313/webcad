/**
 * SO02 / handoff P1: shell wall thickness t≤0 must REJECT on confirm —
 * original model, preview, and history unchanged. Legal t=2 still rebuilds.
 * Never coerce 0→1 / negative→0.1 (shell-edit Math.max bug).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume, getOC } = await import('replicad')

const g = () => useApp.getState()
const baseBox = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [20, 20] }, height: 20, operation: 'new' }
const shell2 = { id: 'shell', type: 'shell', thickness: 2, nears: [[10, 10, 20]] }

async function volumeOfExport() {
  return measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))
}

test('worker rejects thickness 0 and negative without mutating committed solid', async () => {
  await w.rebuild([baseBox])
  const before = await volumeOfExport()
  assert.ok(Math.abs(before - 8000) < 1e-5)
  for (const thickness of [0, -1, -2.5]) {
    const m = await w.rebuild([baseBox, { ...shell2, id: 'bad', thickness }])
    assert.ok(m.failed?.some((f) => f.id === 'bad'), `thickness ${thickness} must fail`)
    assert.ok(Math.abs(await volumeOfExport() - 8000) < 1e-5, `thickness ${thickness} must retain solid`)
  }
})

test('legal t=2 shell rebuilds exact walls after illegal attempts', async () => {
  const m = await w.rebuild([baseBox, shell2])
  assert.deepEqual(m.failed ?? [], [])
  const result = await importSTEP(new Blob([await w.exportSTEP()]))
  assert.ok(Math.abs(measureVolume(result) - (8000 - 16 * 16 * 18)) < 1e-5)
  const check = new (getOC().BRepCheck_Analyzer)(result.wrapped, true, false)
  assert.equal(check.IsValid_2(), true)
  check.delete()
})

test('commitShell rejects t≤0: features, preview mesh, undo history unchanged', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([baseBox], 'box'), true, g().status)
  const before = {
    features: structuredClone(g().features),
    undo: g().undoStack.length,
    redo: g().redoStack.length,
    body: g().bodyMesh,
    preview: g().shellPreviewMesh,
  }
  g().toggleShell()
  g().shellPickAt([10, 20, -10])
  for (const th of [0, -3]) {
    g().setShellThickness(th)
    assert.equal(g().shellThickness, th, 'illegal thickness must not be clamped away before confirm')
    await g().commitShell()
    assert.match(g().status, /大于 0|壁厚/)
    assert.equal(g().shellMode, true, 'stay in shell command after reject')
    assert.deepEqual(g().features, before.features)
    assert.equal(g().undoStack.length, before.undo)
    assert.equal(g().redoStack.length, before.redo)
    assert.equal(g().shellPreviewMesh, before.preview)
    assert.equal(g().bodyMesh, before.body)
  }
  g().setShellThickness(2)
  await g().commitShell()
  assert.equal(g().shellMode, false, g().status)
  assert.equal(g().features.at(-1)?.type, 'shell')
  assert.equal(g().features.at(-1)?.thickness, 2)
})

test('shell-edit confirm rejects t≤0 without coercing to 0.1/1', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([baseBox, { ...shell2, id: 'keep' }], 'shelled'), true, g().status)
  const before = structuredClone(g().features)
  const undoLen = g().undoStack.length
  for (const thickness of [0, -1]) {
    useApp.setState({
      featDlg: { kind: 'shell-edit', editId: 'keep', params: { thickness, nearsN: 1, direction: 'inside' } },
    })
    await g().commitFeatDlg()
    assert.match(g().status, /大于 0|壁厚/)
    assert.ok(g().featDlg, 'dialog stays open on reject')
    assert.deepEqual(g().features, before)
    assert.equal(g().undoStack.length, undoLen)
    assert.equal(g().features.find((f) => f.id === 'keep')?.thickness, 2)
  }
  useApp.setState({
    featDlg: { kind: 'shell-edit', editId: 'keep', params: { thickness: 2, nearsN: 1, direction: 'inside' } },
  })
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.equal(g().features.find((f) => f.id === 'keep')?.thickness, 2)
})

test('store source no longer coerces illegal shell thickness on edit confirm', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(store, /shell-edit[\s\S]{0,400}Math\.max\(0\.1,\s*\+p\.thickness/)
  assert.match(store, /if \(!\(th > 0\)\) \{ set\(\{ status: '请输入大于 0 的壁厚' \}\); return \}/)
  const start = store.indexOf("setShellThickness: (n) =>")
  assert.match(store.slice(start, start + 120), /Number\.isFinite\(n\) \? n : 0/)
})

test('buildShellFeature still refuses non-positive thickness for preview/commit', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const start = store.indexOf('function buildShellFeature(')
  const end = store.indexOf('\nlet _shellPvTimer', start)
  const js = stripTypeScriptTypes(store.slice(start, end))
  const buildShellFeature = new Function(`${js}; return buildShellFeature`)()
  const input = { shellPicks: [[2, 3, 4]], shellThickness: 2, shellType: 'open', shellDir: 'inside', shellTangentChain: true }
  for (const shellThickness of [0, -1, NaN, Infinity]) assert.equal(buildShellFeature({ ...input, shellThickness }, 'shell'), null)
  assert.equal(buildShellFeature(input, 'shell').thickness, 2)
})
