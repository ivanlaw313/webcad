// ASM2 干涉檢查：方塊嵌入底板竟報「✓ 無干涉…最近間隙 ≈8.7 mm（頂點取樣）」。
// 根因：AABB 重疊後先用蒙特卡洛射線奇偶預篩 —— 軸對齊方塊（OCCT 逐面重複頂點）嘅射線擦正邊／面 → 0 → 唔做布爾。
// 修正：AABB 重疊嘅每對直接做實體布爾相交（manifold intersect）→ 真重疊體積＋兩個組件名＋紅色重疊幾何。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
// OCCT-style box: 6 faces × 4 own vertices (duplicated per face), outward CCW
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
const comp = (id, name, mesh) => ({ id, name, mesh, pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' })
const run = async (comps) => { useApp.setState({ components: comps, joints: [], componentDefs: [], interfSubset: [], interfIncludeCoincident: false, interfReport: null }); await g().checkInterference(); return g() }

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

test('box resting on the plate (touching) and box clear above → no interference; gap reported in formal text', async () => {
  const touch = await run([comp('C1', '底板', box(-40, -30, 0, 40, 30, 10)), comp('C2', '方塊', box(-10, -10, 10, 10, 10, 30))])
  assert.equal(touch.interfReport.hits.length, 0, touch.status)
  const clear = await run([comp('C1', '底板', box(-40, -30, 0, 40, 30, 10)), comp('C2', '方塊', box(-10, -10, 15, 10, 10, 30))])
  assert.equal(clear.interfReport.hits.length, 0); assert.match(clear.status, /✓ 無干涉.*頂點取樣估算/)
})

test('panel button says 「計算」 (no English), shows 計算中… while busy', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(vp, /Compute 計算/)
  assert.match(vp, /data-testid="interf-compute"[^\n]*tStatus\(interfBusy \? '計算中…' : '計算', lang\)/)
})

// WORKFLOW2 P1：關節非零角令轉臂穿過底板 → 必須偵測到干涉；angle=0 乾淨姿態無干涉。
// 亦覆蓋「occ.mesh 被剥空 + 非零 rot + 幾何只在 componentDefs」——舊碼用空 mesh 計旋轉中心 → NaN → 假陰性。
test('revolute arm at 90° through plate → interference; angle 0 → clear', async () => {
  const plate = box(-50, -40, 0, 50, 40, 8)
  const arm = box(-4, -4, 10, 4, 4, 80)
  const C1 = { id: 'C1', name: '底板', mesh: plate, pos: [0, 0, 0], rot: [0, 0, 0], color: '#888', grounded: true }
  const C2 = { id: 'C2', name: '轉臂', mesh: arm, pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' }
  const joint = { id: 'J1', name: '關節1', type: 'revolute', parent: 'C1', child: 'C2', anchor: [0, 8, 0], axis: [1, 0, 0], angle: 90, slide: 0 }
  useApp.setState({ components: [C1, C2], joints: [joint], componentDefs: [], interfSubset: [], interfIncludeCoincident: false, interfReport: null })
  await g().checkInterference()
  const hit = g()
  assert.equal(hit.interfReport.hits.length, 1, hit.status)
  assert.deepEqual([hit.interfReport.hits[0].a, hit.interfReport.hits[0].b].sort(), ['底板', '轉臂'].sort())
  assert.ok(hit.interfReport.hits[0].vol > 100, `vol ${hit.interfReport.hits[0].vol}`)
  assert.match(hit.status, /⚠ 干涉/)

  useApp.setState({ joints: [{ ...joint, angle: 0 }], interfReport: null })
  await g().checkInterference()
  assert.equal(g().interfReport.hits.length, 0, g().status)
  assert.match(g().status, /✓ 無干涉/)
})

test('defs-only empty occ.mesh + non-zero rot + revolute 90° still detects interference (no NaN pose)', async () => {
  const plate = box(-50, -40, 0, 50, 40, 8)
  const arm = box(-4, -4, 10, 4, 4, 80)
  const defs = [
    { id: 'D1', name: '底板', mesh: plate, rev: 1, bodies: [{ id: 'D1_B1', name: '底板', mesh: plate }] },
    { id: 'D2', name: '轉臂', mesh: arm, rev: 1, bodies: [{ id: 'D2_B1', name: '轉臂', mesh: arm }] },
  ]
  const empty = { vertices: [], triangles: [], normals: [] }
  const comps = [
    { id: 'C1', name: '底板', mesh: empty, pos: [0, 0, 0], rot: [0, 0, 0], defId: 'D1', _rev: 1, grounded: true },
    { id: 'C2', name: '轉臂', mesh: empty, pos: [0, 0, 0], rot: [12, -8, 5], defId: 'D2', _rev: 1 },
  ]
  const joint = { id: 'J1', name: '關節1', type: 'revolute', parent: 'C1', child: 'C2', anchor: [0, 8, 0], axis: [1, 0, 0], angle: 90, slide: 0 }
  useApp.setState({ components: comps, componentDefs: defs, joints: [joint], interfSubset: [], interfIncludeCoincident: false, interfReport: null, groups: [] })
  await g().checkInterference()
  const s = g()
  assert.equal(s.interfReport.hits.length, 1, s.status)
  assert.match(s.status, /⚠ 干涉/)
  assert.ok(s.interfReport.hits[0].vol > 50, `vol ${s.interfReport.hits[0].vol}`)
})
