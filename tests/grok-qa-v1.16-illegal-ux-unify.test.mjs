/**
 * v1.16 BUG-UI-001: Shell t≤0 and feature-timeline / prim length dims ≤0
 * must call illegalRejectStatus / setStatus containing 「尺寸已拒绝」
 * (same helper as hole Ø + sketch). APP_VERSION was 1.15 at merge; later releases bump it.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { illegalRejectStatus, ILLEGAL_REJECT_MARKER, ILLEGAL_THICKNESS_DETAIL, ILLEGAL_LENGTH_DETAIL } from '../src/ui/illegalInput.ts'

const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')

test('BUG-UI-001: setShellThickness / setFeatParam / commitFeatDlg use illegal helper', () => {
  assert.match(storeSrc, /setShellThickness: \(n\) => \{/)
  assert.match(storeSrc, /illegalRejectStatus\(ILLEGAL_THICKNESS_DETAIL\)/)
  assert.match(storeSrc, /isNonPositiveDim\(v\)/)
  assert.match(storeSrc, /liveReject/)
  assert.match(storeSrc, /illegalRejectStatus\(ILLEGAL_LENGTH_DETAIL\)/)
  assert.match(storeSrc, /if \(!\(th > 0\)\) \{ set\(\{ status: illegalRejectStatus\(ILLEGAL_THICKNESS_DETAIL\) \}\); return \}/)
})

test('BUG-UI-001: Timeline NumField reject announces 尺寸已拒绝', () => {
  assert.match(timeline, /illegalRejectStatus\(rejectDetail \|\| ILLEGAL_LENGTH_DETAIL\)/)
  assert.match(timeline, /rejectDetail=\{fd\.key === 'thickness' \? ILLEGAL_THICKNESS_DETAIL/)
  assert.match(timeline, /from '\.\.\/ui\/illegalInput'/)
})

test('BUG-UI-001: Shell + prim dialogs show the same reject marker as hole', () => {
  assert.match(viewport, /data-testid="shell-illegal-alert"/)
  assert.match(viewport, /data-testid="shell-edit-illegal-alert"/)
  assert.match(viewport, /data-testid="prim-illegal-alert"/)
  assert.match(viewport, /data-testid="hole-illegal-alert"/)
  assert.match(viewport, /illegalRejectStatus\(ILLEGAL_THICKNESS_DETAIL\)/)
  assert.match(viewport, /illegalRejectStatus\(ILLEGAL_LENGTH_DETAIL\)/)
})

test('APP_VERSION is a product release string (bumped after v1.16)', () => {
  assert.match(version, /APP_VERSION = '\d+\.\d+'/)
})

test('helper still embeds 尺寸已拒绝', () => {
  assert.equal(ILLEGAL_REJECT_MARKER, '尺寸已拒绝')
  assert.match(illegalRejectStatus(ILLEGAL_THICKNESS_DETAIL), /尺寸已拒绝：壁厚必须大于 0/)
  assert.match(illegalRejectStatus(ILLEGAL_LENGTH_DETAIL), /尺寸已拒绝：尺寸必须大于 0/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

test('BUG-UI-001 runtime: setShellThickness(≤0) sets 尺寸已拒绝 without commit', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const box = { id: 'box', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, op: 'new' }
  assert.equal(await g().applyFeatures([box], 'box'), true, g().status)
  g().toggleShell()
  assert.equal(g().shellThickness, 2)
  g().setShellThickness(0)
  assert.equal(g().shellThickness, 0)
  assert.match(g().status, /尺寸已拒绝/)
  assert.match(g().status, /壁厚/)
  g().setShellThickness(-1)
  assert.equal(g().shellThickness, -1)
  assert.match(g().status, /尺寸已拒绝/)
  const feats = structuredClone(g().features)
  await g().commitShell()
  assert.match(g().status, /尺寸已拒绝|请先选择/)
  assert.deepEqual(g().features, feats)
})

test('BUG-UI-001 runtime: timeline editFeature a=-1 still 尺寸已拒绝 + unchanged', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const box = { id: 'box', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new' }
  assert.equal(await g().applyFeatures([box], 'box'), true, g().status)
  const before = structuredClone(g().features)
  await g().editFeature('box', { a: -1 })
  assert.match(g().status, /尺寸已拒绝/)
  assert.deepEqual(g().features, before)
})

test('BUG-UI-001 runtime: setFeatParam live-type ≤0 announces 尺寸已拒绝', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({ featDlg: { kind: 'shell-edit', editId: 'sh', params: { thickness: 2 } } })
  g().setFeatParam('thickness', 0)
  assert.equal(g().featDlg?.params.thickness, 0)
  assert.match(g().status, /尺寸已拒绝/)
  assert.match(g().status, /壁厚/)
  useApp.setState({ featDlg: { kind: 'box', params: { l: 20, w: 20, h: 20 } } })
  g().setFeatParam('l', -1)
  assert.equal(g().featDlg?.params.l, -1)
  assert.match(g().status, /尺寸已拒绝/)
})
