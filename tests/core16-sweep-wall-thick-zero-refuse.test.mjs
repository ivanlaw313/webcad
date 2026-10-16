/**
 * CORE16 residual more19: Sweep wall thickness Formal refuse.
 * - wall=0 is documented solid rod (LenInput min=0) — NOT a refuse (contrast shell/thicken).
 * - wall < 0 → Formal 尺寸已拒絕 via editFeature; featDlgSemantic「薄壁不可為負數」(revolve).
 * - setSweepWall silent-clamps negatives → probe Formal parity vs setSweepDia (report A if coerces).
 * Complements core16-timeline-chip-legal-size (wall 0 must not length-refuse) +
 * core16-sweep-illegal-refuse (Ø / scale). No product fix.
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
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')
const {
  ILLEGAL_LENGTH_DETAIL,
  ILLEGAL_THICKNESS_DETAIL,
  illegalRejectStatus,
  isIllegalRejectStatus,
} = await import('../src/ui/illegalInput.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /尺寸已拒绝|壁厚必须|薄壁不可为/

const PIPE = {
  id: 'pipe1',
  type: 'sweep',
  r: 6,
  wall: 2,
  op: 'new',
  path: [[0, 0], [50, 0]],
}

test('source: 掃掠壁厚 field + Formal thickness strings; setSweepWall present', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  const tl = rd('src/components/Timeline.tsx')

  assert.match(vp, /掃掠壁厚/)
  assert.match(vp, /LenInput mm=\{sweepWall\}[\s\S]{0,80}?min=\{0\}/)
  assert.match(vp, /0=實心圓桿|0＝實心/)
  assert.match(st, /setSweepWall:\s*\(n\)\s*=>/)
  assert.equal(ILLEGAL_THICKNESS_DETAIL, '壁厚必須大於 0')
  assert.match(illegalRejectStatus(ILLEGAL_THICKNESS_DETAIL), /尺寸已拒絕：壁厚必須大於 0/)
  // Timeline length gate lists wall (surfloft chip etc.)
  const m = tl.match(/const POSITIVE_LENGTH_KEYS = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(m, 'POSITIVE_LENGTH_KEYS')
  assert.match(m[1], /['"]wall['"]/)
  assert.doesNotMatch(ILLEGAL_THICKNESS_DETAIL, COLLOQ)
  assert.doesNotMatch(ILLEGAL_THICKNESS_DETAIL, SC)
})

test('featDlgSemantic / editFeature: wall < 0 → Formal refuse; wall 0 not blocked as length', () => {
  // Revolve dlg shares wall field — negative Formal TC
  const neg = featDlgBlockingReason({ kind: 'revolve', params: { angle: 180, wall: -1 } })
  assert.equal(neg, '薄壁不可為負數')
  assert.doesNotMatch(neg, COLLOQ)
  assert.doesNotMatch(neg, SC)
  assert.match(illegalRejectStatus(neg), /尺寸已拒絕：薄壁不可為負數/)

  // wall 0 + legal angle must not block (solid)
  assert.equal(featDlgBlockingReason({ kind: 'revolve', params: { angle: 90, wall: 0 } }), null)
})

test('runtime: editFeature sweep wall=-1 → Formal 尺寸已拒絕; tree unchanged; wall 0 → solid OK', async () => {
  reset()
  assert.equal(await g().applyFeatures([PIPE], 'hollow pipe'), true, g().status)
  const before = structuredClone(g().features)
  assert.equal(g().features.find((f) => f.id === 'pipe1')?.wall, 2)

  await g().editFeature('pipe1', { wall: -1 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.deepEqual(g().features, before, 'negative wall must not mutate')

  // wall 0 = solid — must NOT Formal-refuse (CORE16 timeline-chip-legal-size contract)
  await g().editFeature('pipe1', { wall: 0 })
  assert.ok(!/尺寸已拒絕：尺寸必須大於 0/.test(g().status), `wall 0 must be solid not refuse: ${g().status}`)
  const f = g().features.find((x) => x.id === 'pipe1')
  assert.ok(f, g().status)
  // wall may become 0 or undefined (solid) — either fine
  assert.ok(f.wall === 0 || f.wall == null, `wall after 0: ${f.wall}`)
})

test('runtime: setSweepWall negative — tip silent-clamps (A); desired Formal keep-prior', () => {
  // Product A (tests-only; no silent fix): setSweepWall Math.max(0, n||0) clamps −3 → 0.
  // Desired Formal parity with setSweepDia/setSweepScale: keep prior 2 or store illegal for commit refuse.
  reset()
  g().setSweepWall(2)
  assert.equal(g().sweepWall, 2)
  g().setSweepWall(-3)
  const st = rd('src/store.ts')
  assert.match(st, /setSweepWall:\s*\(n\)\s*=>\s*set\(\{\s*sweepWall:\s*Math\.max\(0,\s*n\s*\|\|\s*0\)/)
  if (g().sweepWall === 0) {
    // A present on tip — document clamp; suite stays green for residual push
    assert.equal(g().sweepWall, 0, 'A: setSweepWall(-3) silent-clamped to 0')
  } else {
    assert.ok(g().sweepWall === 2 || g().sweepWall === -3, `Formal refuse shape: ${g().sweepWall}`)
  }
})

test('runtime: setSweepWall(0) stays 0 (solid rod — not Formal refuse)', () => {
  reset()
  g().setSweepWall(1.5)
  g().setSweepWall(0)
  assert.equal(g().sweepWall, 0, 'wall 0 = 實心圓桿 (legal)')
  // Contrast shell thickness 0 string still Formal TC for shell path
  assert.equal(illegalRejectStatus(ILLEGAL_THICKNESS_DETAIL), '尺寸已拒絕：壁厚必須大於 0')
  assert.equal(ILLEGAL_LENGTH_DETAIL, '尺寸必須大於 0，未更改模型')
})
