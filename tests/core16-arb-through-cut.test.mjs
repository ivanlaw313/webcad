/**
 * CORE16 P1：任意平面（arbPlane）草圖「切除 · 貫通」要真係穿透實體。
 * 以前 worker arb 分支唔睇 f.through → 用 height（貫通時常為 0）→ 「切割沒有碰觸實體」。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const worker = globalThis.__wheelWorker
await worker.ready()
const { importSTEP, measureVolume } = await import('replicad')

const vol = async (features) => {
  const mesh = await worker.rebuild(features)
  assert.ok(mesh && !(mesh.failed?.length), JSON.stringify(mesh?.failed))
  return measureVolume(await importSTEP(new Blob([await worker.exportSTEP()])))
}
const plate = { id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 8, operation: 'new' }   // 19200
const circle = { kind: 'circle', c: [0, 0], r: 5 }
const area = Math.PI * 25

test('arbPlane through-cut from the top face drills the whole plate (both flip states)', async () => {
  for (const down of [undefined, true]) {
    const v = await vol([plate, { id: 'c1', type: 'extrude', profile: circle, height: 0, operation: 'cut', through: true, down, arbPlane: { o: [5, 3, 8], xd: [1, 0, 0], n: [0, 0, 1] } }])
    assert.ok(Math.abs(v - (19200 - area * 8)) < 2, `down=${down}: ${v}`)
  }
})

test('arbPlane through-cut from a datum plane floating above the plate still cuts', async () => {
  const v = await vol([plate, { id: 'c1', type: 'extrude', profile: circle, height: 0, operation: 'cut', through: true, arbPlane: { o: [0, 0, 40], xd: [1, 0, 0], n: [0, 0, 1] } }])
  assert.ok(Math.abs(v - (19200 - area * 8)) < 2, String(v))
})

test('arbPlane blind cut without through is unchanged (depth 3)', async () => {
  const v = await vol([plate, { id: 'c1', type: 'extrude', profile: circle, height: 3, exactDistance: true, operation: 'cut', arbPlane: { o: [0, 0, 8], xd: [1, 0, 0], n: [0, 0, 1] } }])
  assert.ok(Math.abs(v - (19200 - area * 3)) < 2, String(v))
})
