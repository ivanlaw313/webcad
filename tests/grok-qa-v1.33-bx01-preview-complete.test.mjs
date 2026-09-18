/**
 * v1.33: BX01-like fuse+fillet+shell previewRound must complete (Confirm path).
 * Discards hypothesis that LIVE stall is an unbounded OCCT hang on the preview
 * ladder — same buildShape as rebuild, which is already CLEAN @v1.31.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
test('APP_VERSION is 1.33+', () => {
  assert.match(version, /APP_VERSION = '1\.3[3-9]'|APP_VERSION = '1\.[4-9]\d'/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const box = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 20, operation: 'new' }
const cyl = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 15 }, height: 25, operation: 'newbody' }
const fuse = { id: 'bb', type: 'bodyboolean', bop: 'fuse', target: 0 }
const fillet = { id: 'f', type: 'fillet', radius: 2, nears: [[15, 0, 20]], chain: false }
const shell = { id: 'shell', type: 'shell', thickness: 2, nears: [[0, 0, 25]], tangentChain: true, direction: 'inside' }

test('HARD BX01-like: previewRound of fuse+R2+shell t=2 completes (Confirm path)', async () => {
  const m = await w.previewRound([box, cyl, fuse, fillet, shell])
  assert.ok(m && (m.triangles?.length ?? 0) > 0, 'previewRound must return a mesh')
  assert.deepEqual(m.failed ?? [], [], `preview failed: ${JSON.stringify(m.failed)}`)
})
