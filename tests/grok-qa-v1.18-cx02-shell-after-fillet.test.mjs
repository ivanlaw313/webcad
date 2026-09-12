/**
 * CX02 (LIVE v1.17 FAIL): box → through Ø10 → fillet hole rim R1 → shell t=1.5
 * inward with one open face must rebuild (bottom/side/top). Default tangent-chain
 * must not swallow the filleted hole into the opening set when seeds alone work.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const prism = readFileSync(new URL('../src/cad/prismaticShell.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.18', () => {
  assert.match(version, /APP_VERSION = '1\.18'/)
})

test('CX02 fix: Arc→Intersection retry + cavityInwardShell fallback wired', () => {
  assert.match(worker, /GeomAbs_Intersection/)
  assert.match(worker, /cavityInwardShell/)
  assert.match(worker, /Prefer the exact selection first/)
  assert.match(worker, /Seeds-only OCCT miss/)
  assert.match(prism, /export function cavityInwardShell/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const box = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-20, -15], b: [20, 15] }, height: 20, operation: 'new' }
const cut = { id: 'cut', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 5 }, height: 20, operation: 'cut', exactDistance: true, baseZ: 0 }
const fillet = { id: 'fillet', type: 'fillet', radius: 1, nears: [[5, 0, 20]], chain: false }

for (const [name, nears, tangentChain] of [
  ['bottom open, tangentChain on', [[15, 10, 0]], true],
  ['bottom open, tangentChain off', [[15, 10, 0]], false],
  ['front open, tangentChain on', [[0, -15, 10]], true],
  ['top open, tangentChain on (seeds before chain)', [[15, 10, 20]], true],
  ['top open, tangentChain off', [[15, 10, 20]], false],
]) {
  test(`CX02: ${name} shell t=1.5 after through-cut + rim fillet`, async () => {
    const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears, tangentChain, direction: 'inside' }
    const m = await w.rebuild([box, cut, fillet, shell])
    assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
    assert.ok((m.triangles?.length ?? 0) > 0, 'viewport mesh must exist')
    // Prefer in-memory body volume: STEP round-trip can flip Orientation on some Intersection shells.
    const body = await w.measureBodyAt(nears[0][2] > 10 ? [15, 10, 18] : nears[0][2] < 5 ? [15, 10, 1] : [0, -14, 10])
    assert.ok(body && body.volume > 4000 && body.volume < 16000, `unexpected volume ${body?.volume}`)
    if (name.startsWith('top open, tangentChain on')) {
      assert.ok(!(m.warnings ?? []).some((w) => /切线链/.test(w)), `must not open fillet+cylinder chain; warnings=${JSON.stringify(m.warnings)}`)
      // Plain-box shell via swallowed cylinder ≈ 5400; seeds/cavity keep a higher ring around the hole.
      assert.ok(body.volume > 5800, `top seeds-only volume too low (chain swallow?): ${body.volume}`)
    }
  })
}

test('CX02 control: shell without fillet still succeeds', async () => {
  const shell = { id: 'shell', type: 'shell', thickness: 1.5, nears: [[15, 10, 0]], tangentChain: true, direction: 'inside' }
  const m = await w.rebuild([box, cut, shell])
  assert.deepEqual(m.failed ?? [], [])
  assert.ok((m.triangles?.length ?? 0) > 0)
  const body = await w.measureBodyAt([15, 10, 1])
  assert.ok(body && body.volume > 4000)
})
