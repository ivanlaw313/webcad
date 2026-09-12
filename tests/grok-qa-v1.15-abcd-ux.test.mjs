/**
 * v1.15 ABCD UX (A+B+C; D = QA by other bots):
 * A — unified illegal-input status (尺寸已拒绝) + driving vs soft/driven dim visuals
 * B — multi-view honesty banner + empty-state copy
 * C — sketch circle precise Ø numeric (SO02)
 * APP_VERSION stays 1.14 on this fix PR.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { illegalRejectStatus, ILLEGAL_REJECT_MARKER, isIllegalRejectStatus } from '../src/ui/illegalInput.ts'

const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const multi = readFileSync(new URL('../src/components/MultiViewPanes.tsx', import.meta.url), 'utf8')
const sketch = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')

test('A: illegalRejectStatus always embeds 尺寸已拒绝 marker', () => {
  assert.equal(ILLEGAL_REJECT_MARKER, '尺寸已拒绝')
  assert.match(illegalRejectStatus('壁厚必须大于 0'), /尺寸已拒绝：壁厚必须大于 0/)
  assert.match(illegalRejectStatus('尺寸已拒绝：已有'), /^尺寸已拒绝：已有$/)
  assert.equal(isIllegalRejectStatus(illegalRejectStatus('孔径Ø必须大于 0')), true)
})

test('A: hole/shell/timeline length rejects use illegalRejectStatus', () => {
  assert.match(storeSrc, /illegalRejectStatus\('孔径Ø必须大于 0'\)/)
  assert.match(storeSrc, /illegalRejectStatus\('壁厚必须大于 0'\)/)
  assert.match(storeSrc, /illegalRejectStatus\('尺寸必须大于 0，未更改模型'\)/)
  assert.match(viewport, /尺寸已拒绝：孔径Ø必须大于 0/)
})

test('A: driving dims visually distinct from soft/driven', () => {
  assert.match(sketch, /data-dim-role=\{/)
  assert.match(sketch, /sk-dim-driving/)
  assert.match(sketch, /sk-dim-soft/)
  assert.match(sketch, /sk-dim-driven/)
  assert.match(sketch, /sk-dim-driving-mark/)
  assert.match(css, /\.sk-dim-driving\s*\{/)
  assert.match(css, /\.sk-dim-soft\s*\{/)
  assert.match(css, /\.sk-dim-driven\s*\{/)
  // Driving constraint lines thicker than driven
  assert.match(sketch, /const lw = c\.driven \? 1\.05 : 1\.85/)
})

test('B: multi-view honesty banner + empty-state copy', () => {
  assert.match(multi, /data-testid="vp-multiview-honesty"/)
  assert.match(multi, /data-multiview-preview="true"/)
  assert.match(multi, /预览／环视/)
  assert.match(multi, /完整工具请切回「单一视图」/)
  assert.match(multi, /vp-pane-empty/)
  assert.match(multi, /此窗格暂无实体/)
  assert.match(css, /\.vp-multiview-banner\s*\{/)
  assert.match(css, /\.vp-pane-empty\s*\{/)
})

test('C: circle typed input is diameter Ø with driving dia constraint', () => {
  assert.match(storeSrc, /SO02: center-circle typed value is diameter/)
  assert.match(storeSrc, /type: 'dia'/)
  assert.match(storeSrc, /驱动直径已保存/)
  assert.match(storeSrc, /打字输入直径/)
  assert.match(storeSrc, /直径Ø/)
  assert.match(viewport, /直径Ø/)
  assert.match(viewport, /sketch-precise-dim/)
  assert.match(viewport, /精确直径Ø/)
})

test('APP_VERSION stays at 1.14 for this fix PR', () => {
  assert.match(version, /APP_VERSION = '1\.14'/)
})

// Runtime
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

test('A runtime: shell/hole/prim illegal values share 尺寸已拒绝', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const box = { id: 'box', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, op: 'new' }
  assert.equal(await g().applyFeatures([box], 'box'), true, g().status)

  g().toggleShell()
  g().shellPickAt([10, 20, -10])
  g().setShellThickness(0)
  await g().commitShell()
  assert.match(g().status, /尺寸已拒绝/)
  assert.match(g().status, /壁厚/)

  useApp.setState({ holeMode: true, holePos: [0, 10, 0], holeFaceZ: 20, holeD: -1, holeThrough: true, holeType: 'simple' })
  await g().commitHole()
  assert.match(g().status, /尺寸已拒绝/)
  assert.match(g().status, /孔径|Ø/)

  const before = structuredClone(g().features)
  await g().editFeature('box', { a: -2 })
  assert.match(g().status, /尺寸已拒绝/)
  assert.deepEqual(g().features, before)
})

test('C runtime: typed circle Ø4 commits exact diameter + driving dia dim', async () => {
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchPlane: 'XY', sketchTool: 'circle' }, true)
  // Place center at origin via typed start, then type diameter 4
  g().sketchTypeKey('0'); g().sketchTypeKey('Tab'); g().sketchTypeKey('0'); g().sketchTypeKey('Enter')
  assert.ok(g().sketchStart, `center placed; status=${g().status}`)
  g().sketchTypeKey('4'); g().sketchTypeKey('Enter')
  const sh = g().sketchShape
  assert.equal(sh?.type, 'circle')
  assert.ok(Math.abs(sh.r - 2) < 1e-9, `r should be 2 for Ø4, got ${sh.r}`)
  const dia = g().skCons.find((c) => c.kind === 'dim' && c.type === 'dia')
  assert.ok(dia, 'driving dia constraint saved')
  assert.equal(dia.value, 4)
  assert.match(g().status, /Ø4|驱动直径/)
})

test('C runtime: illegal typed Ø≤0 rejected with 尺寸已拒绝', async () => {
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchPlane: 'XY', sketchTool: 'circle' }, true)
  g().sketchTypeKey('0'); g().sketchTypeKey('Tab'); g().sketchTypeKey('0'); g().sketchTypeKey('Enter')
  // Type 0 — must reject
  g().sketchTypeKey('0'); g().sketchTypeKey('Enter')
  assert.match(g().status, /尺寸已拒绝/)
  assert.equal(g().sketchShape, null)
  assert.ok(g().sketchStart, 'stay in draw after reject')
})
