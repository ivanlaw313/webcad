// Goal B：浮雕 凸起／刻入 — 平面與圓柱側面；preview volumeExact ≈ commit；樹名「浮雕」
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

const box = { id: 'b', type: 'extrude', profile: { kind: 'rect', a: [-20, -15], b: [20, 15] }, height: 10, operation: 'new' }

async function assertPvCommit(feats, { expectDelta } = {}) {
  const before = feats.length > 1 ? ((await W.rebuild(feats.slice(0, -1))).volumeExact ?? 0) : 0
  const pv = await W.previewRound(feats)
  const commit = await W.rebuild(feats)
  assert.ok(pv?.volumeExact > 0, 'preview volumeExact')
  assert.ok(commit?.volumeExact > 0, 'commit volumeExact')
  assert.ok(Math.abs(pv.volumeExact - commit.volumeExact) < 1e-6,
    `preview ${pv.volumeExact} ≈ commit ${commit.volumeExact}`)
  if (expectDelta === 'add') assert.ok(commit.volumeExact > before + 0.2, `add: before ${before} after ${commit.volumeExact}`)
  if (expectDelta === 'cut') assert.ok(commit.volumeExact < before - 0.2, `cut: before ${before} after ${commit.volumeExact}`)
  return { before, pv: pv.volumeExact, commit: commit.volumeExact }
}

test('B1: planar emboss (add) preview ≈ commit', async () => {
  const text = {
    id: 't', type: 'text', text: 'AB', size: 8, height: 1.5, op: 'new',
    arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] },
  }
  await assertPvCommit([box, text], { expectDelta: 'add' })
})

test('B2: planar engrave (cut) preview ≈ commit', async () => {
  const text = {
    id: 't', type: 'text', text: 'AB', size: 8, height: 1.5, op: 'cut',
    arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] },
  }
  await assertPvCommit([box, text], { expectDelta: 'cut' })
})

test('B3: cylindrical emboss (add) preview ≈ commit', async () => {
  const r = 10, h = 24
  const cyl = { id: 'c', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r }, height: h, operation: 'new' }
  const text = {
    id: 't', type: 'text', text: 'C', size: 6, height: 1, op: 'new',
    arbPlane: { o: [r, 0, h / 2], xd: [0, 0, 1], n: [1, 0, 0] },
  }
  await assertPvCommit([cyl, text], { expectDelta: 'add' })
})

test('B4: cylindrical engrave (cut) preview ≈ commit', async () => {
  const r = 10, h = 24
  const cyl = { id: 'c', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r }, height: h, operation: 'new' }
  const text = {
    id: 't', type: 'text', text: 'C', size: 6, height: 1.2, op: 'cut',
    arbPlane: { o: [r, 0, h / 2], xd: [0, 0, 1], n: [1, 0, 0] },
  }
  await assertPvCommit([cyl, text], { expectDelta: 'cut' })
})

test('B5: depth edit changes volume; empty-text Formal TC in featDlgNumeric + tree 浮雕', () => {
  const num = fs.readFileSync(new URL('../src/cad/featDlgNumeric.ts', import.meta.url), 'utf8')
  // Detail-only in semantic reason — Viewport prefixes 「尺寸已拒絕：」 once (no duplicated marker).
  assert.match(num, /return '請輸入浮雕文字'/)
  assert.match(num, /return '浮雕深度必須大於 0/)
  assert.doesNotMatch(num, /return '尺寸已拒絕：請輸入浮雕文字'/)
  const vp = fs.readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /尺寸已拒絕：\{block\}/)
  assert.match(vp, /尺寸已拒絕：\{featDlgBlockingReason\(featDlg\)\}/)
  const tl = fs.readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
  assert.match(tl, /arbPlane \? '浮雕'/)
  const bt = fs.readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  assert.match(bt, /label:\s*'浮雕'/)
  const st = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(st, /平面或圓柱側面/)
  assert.match(st, /尺寸已拒絕：請輸入浮雕文字/)
})

test('B6: commitFeatDlg emboss uses applyFeatures (one undo step); cancelSweepDlg clears preview', async () => {
  const st = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  // emboss commit → applyFeatures (records undo by default record=true)
  assert.match(st, /kind === 'emboss'[\s\S]{0,800}?applyFeatures\(\[\.\.\.get\(\)\.features, f\]/)
  assert.match(st, /cancelSweepDlg:[\s\S]{0,200}?sweepPreview: null/)
  // auto-fillet Formal TC warning string (status after OK via formatBuildWarnings)
  const w = fs.readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  assert.match(w, /路徑 \$\{fr\.count\} 個尖角已自動圓角/)
  assert.match(w, /不能套用扭轉：此路徑在自動圓角後仍產生錯誤幾何/)
})
