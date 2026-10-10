// FISHING11 P2：圆柱侧浮雕预览体积 = 确定后结果（同一 fuseRobust 沉入路径 + previewRound.volumeExact）
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { loadFont } = await import('replicad')
const buf = fs.readFileSync(new URL('../src/fonts/Roboto-Regular.ttf', import.meta.url))
await loadFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'cad', true)
const W = globalThis.__wheelWorker

test('P2: curved emboss preview volumeExact matches commit (cylinder side letter C)', async () => {
  const r = 10, h = 20
  const cyl = { id: 'c', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r }, height: h, operation: 'new' }
  const before = (await W.rebuild([cyl])).volumeExact
  assert.ok(before > 0)
  const text = {
    id: 't', type: 'text', text: 'C', size: 8, height: 1, op: 'new',
    arbPlane: { o: [r, 0, h / 2], xd: [0, 0, 1], n: [1, 0, 0] },
  }
  const pv = await W.previewRound([cyl, text])
  const commit = await W.rebuild([cyl, text])
  assert.ok(pv.volumeExact > 0, 'preview returns B-rep volumeExact')
  assert.ok(commit.volumeExact > before + 0.5, `commit must add material: before ${before} after ${commit.volumeExact}`)
  assert.ok(Math.abs(pv.volumeExact - commit.volumeExact) < 1e-6, `preview ${pv.volumeExact} ≈ commit ${commit.volumeExact}`)
})

test('P3: BrowserTree hole label 孔; emboss tree name 浮雕; thread toast 複合體 no compound', () => {
  const bt = fs.readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  assert.match(bt, /hole:\s*\{\s*icon:\s*'hole',\s*label:\s*'孔'\s*\}/)
  assert.match(bt, /label:\s*'浮雕'/)
  assert.match(bt, /arbPlane/)
  const tl = fs.readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(tl, /arbPlane \? '浮雕'/)
  const st = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(st, /複合體 — 之後不要再倒角/)
  assert.match(st, /複合體 — 之後不要倒角\/STEP/)
  assert.match(st, /複合體 — 之後不要再倒圓角/)
  assert.doesNotMatch(st, /；compound —/)
  assert.doesNotMatch(st, /，复合體/)
})
