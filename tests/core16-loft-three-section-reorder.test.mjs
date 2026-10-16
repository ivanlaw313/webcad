/**
 * CORE16 residual more18: Loft three sections — ↑↓ reorder (moveLoftSection).
 * Complements loft-dialog-store (mixed-plane reorder+remove) with a pure
 * 3-section XY residual: ↑ then ↓, loftOrderManual, commit keeps dialog order
 * (not re-sorted by z). UI ↑↓ buttons in LoftSectionList. Tests only.
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
const { useApp } = await import('../src/store.ts')
const { loftEffectiveOrder, loftMoveOrder } = await import('../src/cad/loftSections.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const W = globalThis.__wheelWorker
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

const square = { type: 'rect', a: [-15, -15], b: [15, 15] }
const circle = (r = 12) => ({ type: 'circle', c: [0, 0], r })
const mid = { type: 'circle', c: [0, 0], r: 10 }

function bank(plane, z, shape) {
  g().sketchOnDatumPlane(plane, z)
  useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] })
  g().addLoftSection()
}

async function bodyVolume() {
  const buf = await W.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}

async function preview() {
  g().scheduleLoftPreview()
  for (let i = 0; i < 100 && (g().loftPreviewBusy || !g().loftPreview); i++) {
    await new Promise((r) => setTimeout(r, 30))
  }
  return g().loftPreview
}

test('source: ↑↓ buttons call moveLoftSection; loftMoveOrder / loftOrderManual wired', () => {
  const ui = rd('src/components/LoftSectionList.tsx')
  const st = rd('src/store.ts')
  assert.match(ui, />↑</)
  assert.match(ui, />↓</)
  assert.match(ui, /moveLoftSection\(i, -1\)/)
  assert.match(ui, /moveLoftSection\(i, 1\)/)
  assert.match(ui, /向前移（改放樣次序）/)
  assert.match(ui, /向後移（改放樣次序）/)
  assert.match(st, /moveLoftSection: \(i, dir\) =>/)
  assert.match(st, /loftOrderManual: true/)
  assert.match(st, /已將截面移去第/)
})

test('loftMoveOrder: three same-plane sections ↑↓ permute indices', () => {
  const secs = [
    { z: 0, plane: 'XY' },
    { z: 40, plane: 'XY' },
    { z: 80, plane: 'XY' },
  ]
  // Auto order sorts by z when not manual → already 0,1,2
  assert.deepEqual(loftEffectiveOrder(secs, false), [0, 1, 2])
  // ↑ on index 2 → swap with 1 → [0, 2, 1]
  assert.deepEqual(loftMoveOrder(secs, false, 2, -1), [0, 2, 1])
  // ↓ on index 0 → [1, 0, 2]
  assert.deepEqual(loftMoveOrder(secs, false, 0, 1), [1, 0, 2])
  // Bounds: ↑ first / ↓ last → null
  assert.equal(loftMoveOrder(secs, true, 0, -1), null)
  assert.equal(loftMoveOrder(secs, true, 2, 1), null)
})

test('runtime: 3 sections ↑↓ sets loftOrderManual; commit keeps dialog order (not z-sort)', async () => {
  reset()
  bank('XY', 0, square)
  bank('XY', 40, mid)
  bank('XY', 80, circle(12))
  assert.equal(g().loftSections.length, 3)
  assert.equal(g().loftOrderManual, false)
  assert.deepEqual(g().loftSections.map((s) => s.z), [0, 40, 80])

  g().openLoftDlg()
  assert.equal(g().loftDlgOpen, true, g().status)

  // ↑ move last (80) before mid → [0, 80, 40]
  g().moveLoftSection(2, -1)
  assert.equal(g().loftOrderManual, true)
  assert.deepEqual(g().loftSections.map((s) => s.z), [0, 80, 40])
  assert.match(g().status, /已將截面移去第 2 位|移去第/)

  // ↓ move first (0) after 80 → [80, 0, 40]
  g().moveLoftSection(0, 1)
  assert.deepEqual(g().loftSections.map((s) => s.z), [80, 0, 40])
  assert.equal(g().loftOrderManual, true)

  // ↑ again on last → [80, 40, 0] (full reverse of original)
  g().moveLoftSection(2, -1)
  assert.deepEqual(g().loftSections.map((s) => s.z), [80, 40, 0])

  const pv = await preview()
  assert.ok(pv?.mesh, `3-section reordered preview: ${pv?.error}`)

  await g().commitLoft()
  const loft = g().features.find((f) => f.type === 'loft')
  assert.ok(loft, g().status)
  assert.deepEqual(
    loft.sections.map((s) => s.z),
    [80, 40, 0],
    'manual ↑↓ order kept (not re-sorted by z)',
  )
  const v = await bodyVolume()
  assert.ok(v > 20000, `reordered 3-section loft volume ${v}`)
})

test('runtime: ↑↓ then restore original order still commits 3 sections', async () => {
  reset()
  bank('XY', 0, square)
  bank('XY', 50, mid)
  bank('XY', 100, circle())
  g().openLoftDlg()

  // Swap mid ↔ top then swap back
  g().moveLoftSection(1, 1) // ↓ mid → [0, 100, 50]
  assert.deepEqual(g().loftSections.map((s) => s.z), [0, 100, 50])
  g().moveLoftSection(1, 1) // ↓ 100 → [0, 50, 100]
  assert.deepEqual(g().loftSections.map((s) => s.z), [0, 50, 100])
  assert.equal(g().loftOrderManual, true)

  await g().commitLoft()
  const loft = g().features.find((f) => f.type === 'loft')
  assert.ok(loft)
  assert.equal(loft.sections.length, 3)
  assert.deepEqual(loft.sections.map((s) => s.z), [0, 50, 100])
  assert.ok((await bodyVolume()) > 20000)
})
