/**
 * SO04 / BUG-SO15-001: Revolve Intersect rebuild.
 * Acceptance:
 *  - base plate + profile revolve intersect → valid B-rep, volume matches preview wedge
 *  - on true empty intersect → keep previous solid
 *  - Intersect without a prior solid is not a boolean (QA File>New→rect→∩): confirm
 *    coerces to New / first feature creates solid; UI gates ∩ on real triangles
 *
 * Partial angles default to the −Z half-space (right-hand about +Y from XY).
 * Cut/intersect preview sweeps −ang‥0 into +Z at the profile (+X). Confirm must
 * use the same sense (rotate(−ang)), not rotate(180) which lands on −X.
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
const worker = globalThis.__wheelWorker
await worker.ready()
const { importSTEP, measureVolume, getOC } = await import('replicad')

const plate = {
  id: 'plate',
  type: 'extrude',
  profile: { kind: 'rect', a: [-30, -20], b: [30, 20] },
  height: 10,
  operation: 'new',
}
/** QA-like plate: only +X / +Z — PR#7 rotate(180) miss; preview −ang hits. */
const platePosX = {
  id: 'plate',
  type: 'extrude',
  profile: { kind: 'rect', a: [0, -20], b: [40, 20] },
  height: 10,
  operation: 'new',
}
const profile = { kind: 'rect', a: [8, -10], b: [28, 10] }
const FULL_INTERSECT = 8946.508663785393
const HALF_INTERSECT = FULL_INTERSECT / 2
const POSX_INTERSECT = FULL_INTERSECT / 2  // +X plate ∩ full revolve ≈ half torus slice in +X

async function rebuildVolume(features) {
  const mesh = await worker.rebuild(features)
  let volume = null
  let valid = null
  try {
    const shape = await importSTEP(new Blob([await worker.exportSTEP()]))
    volume = measureVolume(shape)
    const check = new (getOC().BRepCheck_Analyzer)(shape.wrapped, true, false)
    try { valid = check.IsValid_2() } finally { check.delete() }
  } catch (e) {
    volume = null
    valid = false
  }
  return { mesh, volume, valid, failed: mesh.failed ?? [], warnings: mesh.warnings ?? [] }
}

test('revolve intersect 360°: valid B-rep with expected common volume', async () => {
  const r = await rebuildVolume([
    plate,
    { id: 'revI', type: 'revolve', profile, angle: 360, axis: 'Y', op: 'intersect' },
  ])
  assert.deepEqual(r.failed, [])
  assert.equal(r.valid, true)
  assert.ok(Math.abs(r.volume - FULL_INTERSECT) < 1e-3, `vol ${r.volume}`)
})

test('revolve intersect 180°/90°: flip into plate, valid B-rep, volume matches +Z wedge', async () => {
  for (const [angle, expected] of [[180, FULL_INTERSECT], [90, HALF_INTERSECT]]) {
    const r = await rebuildVolume([
      plate,
      { id: 'revI', type: 'revolve', profile, angle, axis: 'Y', op: 'intersect' },
    ])
    assert.deepEqual(r.failed, [], `angle ${angle} failed: ${JSON.stringify(r.failed)}`)
    assert.ok((r.mesh.triangles?.length ?? 0) > 0, `angle ${angle} empty mesh`)
    assert.equal(r.valid, true, `angle ${angle} invalid B-rep`)
    assert.ok(Math.abs(r.volume - expected) < 1e-2, `angle ${angle} vol ${r.volume}, expected ${expected}`)
  }
})

test('revolve intersect 90° on +X-only plate matches preview −ang sense (not rotate 180/−X)', async () => {
  const r = await rebuildVolume([
    platePosX,
    { id: 'revI', type: 'revolve', profile, angle: 90, axis: 'Y', op: 'intersect' },
  ])
  assert.deepEqual(r.failed, [], `failed: ${JSON.stringify(r.failed)}`)
  assert.equal(r.valid, true)
  // +X plate ∩ +Z half lives entirely in the first 90° from +X toward +Z (x≥0),
  // so 90° preview-sense volume equals the full +X ∩ revolve common volume.
  assert.ok(Math.abs(r.volume - POSX_INTERSECT) < 1e-1, `vol ${r.volume}, expected ~${POSX_INTERSECT}`)
})

test('revolve cut 180° removes the +Z wedge (not a silent no-op)', async () => {
  const r = await rebuildVolume([
    plate,
    { id: 'revC', type: 'revolve', profile, angle: 180, axis: 'Y', op: 'cut' },
  ])
  assert.deepEqual(r.failed, [])
  assert.equal(r.valid, true)
  assert.ok(Math.abs(r.volume - (24000 - FULL_INTERSECT)) < 1e-2, `cut vol ${r.volume}`)
})

test('empty revolve intersect keeps previous solid (failed + volume unchanged)', async () => {
  await worker.rebuild([plate])
  const before = measureVolume(await importSTEP(new Blob([await worker.exportSTEP()])))
  const r = await rebuildVolume([
    plate,
    {
      id: 'revE',
      type: 'revolve',
      profile: { kind: 'rect', a: [100, -5], b: [110, 5] },
      angle: 360,
      axis: 'Y',
      op: 'intersect',
    },
  ])
  assert.ok(r.failed.some((f) => f.id === 'revE'), `expected failed revE, got ${JSON.stringify(r.failed)}`)
  const after = measureVolume(await importSTEP(new Blob([await worker.exportSTEP()])))
  assert.ok(Math.abs(after - before) < 1e-3, `must keep plate volume ${before}, got ${after}`)
  assert.ok(Math.abs(after - 24000) < 1e-3)
})

test('worker revolve boolean path prefers preview −ang sense and rolls back empty', () => {
  const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  const preview = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(workerSrc, /SO04: partial-angle revolve/)
  assert.match(workerSrc, /rotate\(-ang, org, rax\)/)
  assert.doesNotMatch(workerSrc, /rotate\(180, org, rax\)/)
  assert.match(workerSrc, /旋转相交区域为空/)
  assert.match(workerSrc, /BUG-SO15-001: no prior solid/)
  assert.match(workerSrc, /f\.type === 'revolve' && \(\(f as any\)\.op === 'cut' \|\| \(f as any\)\.op === 'intersect'\)/)
  assert.match(preview, /flipSense \? -total : 0/)
  assert.match(preview, /op === 'cut' \|\| op === 'intersect'/)
  // Confirm coerces cut/intersect → new when timeline has no solid (loft/sweep policy).
  assert.match(storeSrc, /BUG-SO15-001: Intersect\/Cut without a prior solid/)
  assert.match(storeSrc, /revOp: BoolOp = \(rawOp === 'cut' \|\| rawOp === 'intersect' \|\| rawOp === 'newbody'\) && hasSolid/)
  // UI: ∩ gated on real triangles — empty independent-sketch bodyMesh must NOT enable Intersect.
  assert.match(viewport, /disabled=\{!bodyMesh\?\.triangles\?\.length\}/)
  assert.match(storeSrc, /无底板时请用＋加料/)
})

test('revolve intersect alone (no prior solid) creates body like New — offset profile', async () => {
  // QA black-box File>New → rect → Revolve∩: worker treats !shape as New.
  const r = await rebuildVolume([
    { id: 'revI', type: 'revolve', profile, angle: 360, axis: 'Y', op: 'intersect' },
  ])
  assert.deepEqual(r.failed, [])
  assert.equal(r.valid, true)
  assert.ok((r.mesh.triangles?.length ?? 0) > 0, 'first-feature intersect must create a solid')
  assert.ok(r.volume > 1e3, `expected solid volume, got ${r.volume}`)
})

test('base plate + offset revolve intersect 360° volume matches common acceptance path', async () => {
  const r = await rebuildVolume([
    plate,
    { id: 'revI', type: 'revolve', profile, angle: 360, axis: 'Y', op: 'intersect' },
  ])
  assert.deepEqual(r.failed, [])
  assert.equal(r.valid, true)
  assert.ok(Math.abs(r.volume - FULL_INTERSECT) < 1e-3, `vol ${r.volume}`)
})

test('BUG-SO16-001: plate + XZ-front profile ∩ Y-axis remaps to lathe plane (confirm matches preview volume)', async () => {
  // Front (XZ) V→Z; about Y → planar sheet without remap. Preview remaps XZ→XY so the ghost
  // has axial (Y) thickness and overlaps the plate; confirm must do the same.
  const r = await rebuildVolume([
    plate,
    { id: 'revXZ', type: 'revolve', profile, angle: 360, axis: 'Y', op: 'intersect', plane: 'XZ' },
  ])
  assert.deepEqual(r.failed, [], `failed: ${JSON.stringify(r.failed)}`)
  assert.equal(r.valid, true)
  assert.ok((r.mesh.triangles?.length ?? 0) > 0)
  assert.ok(Math.abs(r.volume - FULL_INTERSECT) < 1e-2, `vol ${r.volume}, expected ~${FULL_INTERSECT}`)
  assert.ok(r.warnings.some((w) => /车削平面|重解释/.test(w)), `expected remap warning, got ${JSON.stringify(r.warnings)}`)
})

test('BUG-SO16-001: plate + XZ ∩ Y 180° partial-angle still matches preview −ang sense', async () => {
  const r = await rebuildVolume([
    plate,
    { id: 'revXZ', type: 'revolve', profile, angle: 180, axis: 'Y', op: 'intersect', plane: 'XZ' },
  ])
  assert.deepEqual(r.failed, [], `failed: ${JSON.stringify(r.failed)}`)
  assert.equal(r.valid, true)
  assert.ok(Math.abs(r.volume - FULL_INTERSECT) < 1e-1, `vol ${r.volume}`)
})

test('BUG-SO16-001 source: worker + preview share revolveLathePlane / remap', () => {
  const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  const frame = readFileSync(new URL('../src/cad/revolvePreviewFrame.ts', import.meta.url), 'utf8')
  const preview = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
  assert.match(frame, /export function revolveLathePlane/)
  assert.match(frame, /export function revolveRemapProfile/)
  assert.match(frame, /p === 'XZ' \? 'XY'/)
  assert.match(workerSrc, /revolveLathePlane\(authoredPlane, rax\)/)
  assert.match(workerSrc, /revolveRemapProfile\(f\.profile/)
  assert.match(workerSrc, /BUG-SO16-001/)
  assert.match(preview, /revolvePreviewContext\(featDlg, features, d\)/)
})

test('BUG-SO17-001 source: worker honors Z and clips axis-crossing profiles', () => {
  const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(workerSrc, /f\.axis === 'Z' \? \[0, 0, 1\]/)
  assert.match(workerSrc, /BUG-SO17-001/)
  assert.match(workerSrc, /latheClipCoord/)
  // BUG-SO111-001: letter comes from revolvePersistedAxis(axisV) so Z button / synced dropdown
  // cannot leave a stale axis:'Y' while axisV is world Z.
  assert.match(storeSrc, /revolvePersistedAxis/)
  assert.match(storeSrc, /BUG-SO111-001/)
})

/**
 * Exact QA SO04 B / BUG-SO17-001 (v1.7 after PR#26 still FAIL):
 *  1. XY rectangle 190×90 mm; extrude 12 mm (base plate from origin)
 *  2. XZ rectangle 85×40 mm overlapping the plate
 *  3. Revolve about Z, (0,0,0), 360°, operation Intersect
 * Preview showed a disk through the plate; Confirm must commit with non-empty volume.
 *
 * Captured runtime errors before this fix:
 *  - OCCT 9231448 / 10057368 when the 85×40 profile straddles Z (MakeRevol throw)
 *    → generic 重建失败 toast via mesh.failed
 *  - "旋转相交区域为空" when plane defaulted to XY and SO16 remapped XY·Z, flipping V into −Z
 */
const qaPlate = {
  id: 'plate',
  type: 'extrude',
  profile: { kind: 'rect', a: [0, 0], b: [190, -90] },
  height: 12,
  operation: 'new',
  plane: 'XY',
}

test('BUG-SO17-001 QA: XY 190×90×12 ∩ XZ 85×40 about Z 360° Intersect commits with volume', async () => {
  // Overlapping Front-XZ silhouette of the origin plate: X 0..85, Z 0..40 (edge on +Z axis is legal).
  const r = await rebuildVolume([
    qaPlate,
    {
      id: 'revZ',
      type: 'revolve',
      profile: { kind: 'rect', a: [0, 0], b: [85, 40] },
      angle: 360,
      axis: 'Y',
      axisV: [0, 0, 1],
      axisOrigin: [0, 0, 0],
      op: 'intersect',
      plane: 'XZ',
      baseZ: 0,
    },
  ])
  assert.deepEqual(r.failed, [], `failed: ${JSON.stringify(r.failed)}`)
  assert.equal(r.valid, true)
  assert.ok((r.mesh.triangles?.length ?? 0) > 0, 'empty mesh')
  assert.ok(r.volume > 1e3, `expected non-empty intersect volume, got ${r.volume}`)
})

test('BUG-SO17-001 QA: 85×40 overlapping profile that straddles Z still commits (OCCT cross-axis)', async () => {
  // 85 wide, overlapping the plate about X=0 — the drawing that made preview a disk and
  // confirm throw 9231448/10057368 (profile crosses the revolve axis).
  const r = await rebuildVolume([
    qaPlate,
    {
      id: 'revZ',
      type: 'revolve',
      profile: { kind: 'rect', a: [-20, 0], b: [65, 40] },
      angle: 360,
      axis: 'Z',
      axisV: [0, 0, 1],
      axisOrigin: [0, 0, 0],
      op: 'intersect',
      plane: 'XZ',
      baseZ: 0,
    },
  ])
  assert.deepEqual(r.failed, [], `failed: ${JSON.stringify(r.failed)}`)
  assert.equal(r.valid, true)
  assert.ok(r.volume > 1e3, `expected non-empty intersect volume, got ${r.volume}`)
})

test('BUG-SO17-001: axis string Z without axisV does not Y-remap an XZ profile', async () => {
  const r = await rebuildVolume([
    qaPlate,
    {
      id: 'revZ',
      type: 'revolve',
      profile: { kind: 'rect', a: [10, 0], b: [95, 40] },
      angle: 360,
      axis: 'Z',
      op: 'intersect',
      plane: 'XZ',
      baseZ: 0,
    },
  ])
  assert.deepEqual(r.failed, [], `failed: ${JSON.stringify(r.failed)}`)
  assert.ok(r.volume > 1e3, `vol ${r.volume}`)
  assert.ok(!(r.warnings ?? []).some((w) => /车削平面 XY/.test(w)), `must not remap XZ·Z to XY, got ${JSON.stringify(r.warnings)}`)
})

test('BUG-SO17-001: missing plane + axisV Z still intersects (V-flip remap retry)', async () => {
  // UI dropped plane → XY default; SO16 remaps XY·Z to XZ and flips V into −Z, missing the
  // plate at Z=0..12. Preview (bundle plane XZ) still drew a +Z disk. Retry the mirrored half.
  const r = await rebuildVolume([
    qaPlate,
    {
      id: 'revZ',
      type: 'revolve',
      profile: { kind: 'rect', a: [10, 0], b: [95, 40] },
      angle: 360,
      axis: 'Y',
      axisV: [0, 0, 1],
      axisOrigin: [0, 0, 0],
      op: 'intersect',
    },
  ])
  assert.deepEqual(r.failed, [], `failed: ${JSON.stringify(r.failed)}`)
  assert.ok(r.volume > 1e3, `vol ${r.volume}`)
})


test('BUG-SO111-001 source: confirm persists cardinal letter from axisV (not stale Y)', () => {
  const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const tlSrc = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(storeSrc, /revolvePersistedAxis/)
  assert.match(storeSrc, /BUG-SO111-001/)
  assert.match(storeSrc, /keep axis letter and dx\/dy\/dz in lockstep/)
  // Timeline feature editor must offer Z (QA reopen showed only X/Y → forced Y display)
  assert.match(tlSrc, /value: 'Z', label: 'Z 轴'/)
  const revMeta = tlSrc.split("revolve: {")[1].split('fillet:')[0]
  assert.match(revMeta, /value: 'Z'/)
})
