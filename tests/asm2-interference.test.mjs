// ASM2 干涉檢查：方塊嵌入底板竟報「✓ 無干涉…最近間隙 ≈8.7 mm（頂點取樣）」。
// 根因：AABB 重疊後先用蒙特卡洛射線奇偶預篩 —— 軸對齊方塊（OCCT 逐面重複頂點）嘅射線擦正邊／面 → 0 → 唔做布爾。
// 修正：AABB 重疊／近距對都直接做實體布爾相交（manifold intersect）→ 真重疊體積＋兩個組件名＋紅色重疊幾何。
// WORKFLOW2：旋轉關節驅動至穿透底板必須報干涉（含組件1）；貼面報「接觸」；間隙讀數收緊。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
function box(x0, y0, z0, x1, y1, z1) {
  const v = [], t = [], n = []
  const face = (p, nn) => { const b = v.length / 3; for (const q of p) v.push(...q); for (let k = 0; k < 4; k++) n.push(...nn); t.push(b, b + 1, b + 2, b, b + 2, b + 3) }
  face([[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1])
  face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1])
  face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0])
  face([[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0])
  face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0])
  face([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0])
  return { vertices: v, triangles: t, normals: n }
}
const comp = (id, name, mesh, extra = {}) => ({ id, name, mesh, pos: [0, 0, 0], rot: [0, 0, 0], color: '#888', ...extra })
const run = async (comps, joints = []) => {
  useApp.setState({ components: comps, joints, componentDefs: [], groups: [], interfSubset: [], interfIncludeCoincident: false, interfReport: null })
  await g().checkInterference()
  return g()
}

test('box embedded 4 mm into a plate → interference with exact overlap volume and both component names', async () => {
  const s = await run([comp('C1', '組件1', box(-40, -30, 0, 40, 30, 10)), comp('C2', '組件2', box(-10, -10, 6, 10, 10, 26))])
  assert.equal(s.interfReport.hits.length, 1, s.status)
  const h = s.interfReport.hits[0]
  assert.deepEqual([h.a, h.b], ['組件1', '組件2'])
  assert.ok(Math.abs(h.vol - 20 * 20 * 4) < 1, `overlap ${h.vol} mm³ (expected 1600)`)
  assert.equal(h.exact, true)
  assert.equal(s.interfMeshes.length, 1, 'overlap geometry highlighted')
  assert.match(s.status, /⚠ 干涉 1 處/); assert.doesNotMatch(s.status, /無干涉|manifold|蒙特卡洛|顶点采样/)
})

test('box fully inside a plate (no boundary crossing) is also caught', async () => {
  const s = await run([comp('C1', '底板', box(-40, -30, 0, 40, 30, 10)), comp('C2', '方塊', box(-5, -5, 2, 5, 5, 8))])
  assert.equal(s.interfReport.hits.length, 1, s.status); assert.ok(Math.abs(s.interfReport.hits[0].vol - 600) < 1)
})

test('box resting on the plate (touching) → 接觸; box clear above → no interference; gap formal', async () => {
  const touch = await run([comp('C1', '底板', box(-40, -30, 0, 40, 30, 10)), comp('C2', '方塊', box(-10, -10, 10, 10, 10, 30))])
  assert.equal(touch.interfReport.hits.length, 1, touch.status)
  assert.equal(touch.interfReport.hits[0].vol, 0)
  assert.match(touch.status, /接觸/)
  const clear = await run([comp('C1', '底板', box(-40, -30, 0, 40, 30, 10)), comp('C2', '方塊', box(-10, -10, 15, 10, 10, 30))])
  assert.equal(clear.interfReport.hits.length, 0); assert.match(clear.status, /✓ 無干涉.*頂點取樣估算/)
  assert.doesNotMatch(clear.status, /≈17/)  // gap readout present but formal
})

test('revolute shaft at 97° through grounded plate reports 組件1∩組件2 with volume (not only 組件2↔組件3 gap)', async () => {
  const plate = box(-50, -40, 0, 50, 40, 8)
  const shaft = box(-4, -4, 8, 4, 4, 80)
  const bush = box(15, -10, 8, 25, 10, 30)
  const joints = [{ id: 'J1', name: '關節1', type: 'revolute', parent: 'C1', child: 'C2', anchor: [0, 8, 0], axis: [0, 0, 1], angle: 97, slide: 0 }]
  const s = await run([
    comp('C1', '組件1', plate, { grounded: true }),
    comp('C2', '組件2', shaft),
    comp('C3', '組件3', bush),
  ], joints)
  assert.ok(s.interfReport.hits.some((h) => h.vol > 100 && ((h.a === '組件1' && h.b === '組件2') || (h.a === '組件2' && h.b === '組件1'))), s.status)
  assert.match(s.status, /組件1/); assert.match(s.status, /⚠ 干涉/)
  assert.doesNotMatch(s.status, /✓ 無干涉/)
})

test('panel button says 「計算」 (no English), shows 計算中… while busy', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(vp, /Compute 計算/)
  assert.match(vp, /data-testid="interf-compute"[^\n]*tStatus\(interfBusy \? '計算中…' : '計算', lang\)/)
})
