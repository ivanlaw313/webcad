// UX1 #2：參數改動後嘅「重建警告」pill／失敗標記唔准帶入「新檔案」；空白文件唔再畫灰色佔位體（用戶以為係殘留線框）。
// 真瀏覽器證明：scripts/e2e-new-file.mjs。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

test('reset (File ▸ New) clears build warnings, failed-feature marks and feature errors', async () => {
  await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-20, -20], b: [20, 20] }, height: 30, operation: 'new' }], 'x')
  useApp.setState({ lastBuildWarnings: ['⚠ 圓角：部分邊失敗'], failedFeatureIds: ['f1'], featureErrors: { f1: 'boom' } })
  await g().reset()
  assert.deepEqual(g().lastBuildWarnings, []); assert.deepEqual(g().failedFeatureIds, []); assert.deepEqual(g().featureErrors, {})
  assert.equal(g().bodyMesh, null); assert.equal(g().features.length, 0)
})
test('an empty rebuild (delete everything) also drops stale warnings', async () => {
  await g().applyFeatures([{ id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-5, -5], b: [5, 5] }, height: 5, operation: 'new' }], 'x')
  useApp.setState({ lastBuildWarnings: ['⚠ stale'] })
  await g().applyFeatures([], 'empty')
  assert.deepEqual(g().lastBuildWarnings, [])
})
test('Viewport no longer renders a grey placeholder body for an empty document', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.ok(!vp.includes('PlaceholderBody'))
  assert.ok(!vp.includes('<boxGeometry args={[100, 40, 60]} />'))
})
