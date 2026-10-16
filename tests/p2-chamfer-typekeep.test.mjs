/**
 * FISHING32 P2：倒角切換類型（等距／雙距離／距離與角度）保留已選邊／面選擇。
 * equal → two → angle → equal：edgeRoundPicks 長度不變；離開 angle 時 chamferRefFace 變 null。
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
const g = () => useApp.getState()
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

const seedPicks = () => {
  useApp.setState({
    ...useApp.getInitialState(),
    edgeRoundPick: 'chamfer',
    edgeRoundPicks: [[1, 2, 3], [4, 5, 6]],
    edgeRoundPickLines: [[[0, 0, 0], [1, 0, 0]], [[0, 1, 0], [1, 1, 0]]],
    edgeRoundRadii: [2, 2],
    edgeRoundGroupIds: [0, 0],
    chamferMode: 'equal',
    chamferRefFace: null,
    edgeRoundSize: 2,
  }, true)
}

test('setChamferMode keeps picks across equal→two→angle→equal', () => {
  seedPicks()
  const n0 = g().edgeRoundPicks.length
  assert.equal(n0, 2)
  g().setChamferMode('two')
  assert.equal(g().edgeRoundPicks.length, n0)
  assert.equal(g().edgeRoundPickLines.length, n0)
  assert.equal(g().edgeRoundRadii.length, n0)
  assert.equal(g().edgeRoundGroupIds.length, n0)
  assert.equal(g().chamferMode, 'two')
  assert.match(g().status, /已改為雙距離（保留已選稜）/)
  assert.equal(g().chamferRefFace, null)

  g().setChamferMode('angle')
  assert.equal(g().edgeRoundPicks.length, n0)
  assert.equal(g().chamferMode, 'angle')
  assert.equal(g().chamferRefFace, null)
  assert.match(g().status, /距離與角度：請選取 1 個參考面（已保留稜邊選擇）/)

  g().setChamferMode('equal')
  assert.equal(g().edgeRoundPicks.length, n0)
  assert.equal(g().chamferMode, 'equal')
  assert.equal(g().chamferRefFace, null)
  assert.match(g().status, /已改為等距（保留已選稜）/)
})

test('leaving angle clears chamferRefFace; entering angle keeps existing ref', () => {
  seedPicks()
  const ref = { p: [0, 1, 0], faceId: 7 }
  useApp.setState({ chamferMode: 'angle', chamferRefFace: ref })
  assert.deepEqual(g().chamferRefFace, ref)

  g().setChamferMode('two')
  assert.equal(g().chamferRefFace, null, 'leaving angle clears ref face')
  assert.equal(g().edgeRoundPicks.length, 2)

  useApp.setState({ chamferMode: 'equal', chamferRefFace: ref })
  g().setChamferMode('angle')
  assert.deepEqual(g().chamferRefFace, ref, 'entering angle keeps existing ref')
  assert.match(g().status, /已改為距離與角度（保留已選稜）/)
})

test('source: no Fusion-clears comment; no edgeRoundPicks: [] in setChamferMode', () => {
  const store = src('store.ts')
  const start = store.indexOf('  setChamferMode: (m) =>')
  assert.ok(start > 0)
  const scm = store.slice(start, store.indexOf('  setChamferSize2:', start))
  assert.doesNotMatch(scm, /Fusion 360 clears/)
  assert.doesNotMatch(scm, /edgeRoundPicks:\s*\[\]/)
  assert.doesNotMatch(scm, /請重新選取稜/)
  assert.match(scm, /scheduleRoundPreview\(\)/)
  assert.match(scm, /已改為雙距離（保留已選稜）/)
  assert.match(scm, /距離與角度：請選取 1 個參考面（已保留稜邊選擇）/)
})
