// ab06dc2 / WORKFLOW2：基本體「自動」— 模型已有實體時一律 → 新實體（唔靠 AABB 重疊）；
// 空白仍 → new。對照：明確選「＋加料」仍然合併入活動體。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

async function prim(kind, params) {
  useApp.setState({ lang: 'zh-HK', featDlg: { kind, params: { op: 'auto', px: 0, py: 0, pz: 0, ...params } } })
  await g().commitFeatDlg()
  return g().features.at(-1)
}
const bbox = (mesh) => {
  const V = mesh.vertices, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]
  for (let i = 0; i < V.length; i += 3) for (let k = 0; k < 3; k++) {
    lo[k] = Math.min(lo[k], V[i + k]); hi[k] = Math.max(hi[k], V[i + k])
  }
  return { lo, hi, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] }
}

test('PrimOpSelect pins WORKFLOW2 auto label（有實體→新實體）', () => {
  const vp = read('src/components/Viewport.tsx')
  assert.match(vp, /自動（有實體→新實體）/)
  assert.doesNotMatch(vp, /自動（重疊→新實體）/)
  assert.match(vp, /data-testid="prim-op"/)
})

test('auto + existing solid: far sphere and far box both become newbody (not Join lump)', async () => {
  useApp.setState(useApp.getInitialState(), true)
  useApp.setState({ lang: 'zh-HK' })
  const plate = await prim('box', { l: 80, w: 60, h: 8 })
  assert.equal(plate.op, 'new')

  const ball = await prim('sphere', { d: 20, px: 200, py: 0, pz: 10 })
  assert.equal(ball.op, 'newbody', 'far sphere auto → newbody')
  assert.match(g().status, /分離 → 新實體|新實體/)
  assert.equal(g().bodyMesh.parked?.length, 1, 'plate parked; sphere active')
  const ballBox = bbox(g().bodyMesh)
  assert.ok(ballBox.size[0] < 25 && ballBox.size[1] < 25, `active is sphere-ish ${JSON.stringify(ballBox.size)}`)

  const side = await prim('box', { l: 10, w: 10, h: 10, px: -100, py: 0, pz: 0 })
  assert.equal(side.op, 'newbody', 'far box auto → newbody')
  assert.equal(g().bodyMesh.parked?.length, 2, 'two previous solids parked')
  const sideBox = bbox(g().bodyMesh)
  assert.ok(Math.abs(sideBox.size[0] - 10) < 0.5 && Math.abs(sideBox.size[2] - 10) < 0.5, JSON.stringify(sideBox.size))
})

test('explicit ＋加料 (op=new) with existing solid still Joins — contrast with auto', async () => {
  useApp.setState(useApp.getInitialState(), true)
  useApp.setState({ lang: 'zh-HK' })
  await prim('box', { l: 50, w: 40, h: 10 })
  useApp.setState({ featDlg: { kind: 'cylinder', params: { op: 'new', d: 16, h: 20, px: 120, py: 0, pz: 0 } } })
  await g().commitFeatDlg()
  const cyl = g().features.at(-1)
  assert.equal(cyl.operation, 'new', 'explicit join keeps operation=new')
  assert.equal(g().bodyMesh.parked?.length ?? 0, 0, 'Join → single active body, no parked')
  const b = bbox(g().bodyMesh)
  // disconnected lump: AABB spans both plate and far cylinder
  assert.ok(b.size[0] > 100, `joined AABB should span both solids, got ${b.size[0]}`)
})
