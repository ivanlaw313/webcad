// UX4 part 2（墊片草圖 P1）：鏡像有尺寸 + 軸上點照樣成功（繁體訊息）、修剪只剪點中嗰段（唔穿過轉角）、
// 修剪保留剩段嘅 H/V/尺寸（DOF 唔會爆升）、重開草圖改尺寸 80→100 拉伸照樣更新（區域簽名對唔上時跟返同一 profile）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const settle = () => new Promise((r) => setTimeout(r, 80))
const rectCons = (s) => [
  { id: 'h0', kind: 'con', type: 'h', a: { kind: 'edge', shape: s, idx: 0 } }, { id: 'v1', kind: 'con', type: 'v', a: { kind: 'edge', shape: s, idx: 1 } },
  { id: 'h2', kind: 'con', type: 'h', a: { kind: 'edge', shape: s, idx: 2 } }, { id: 'v3', kind: 'con', type: 'v', a: { kind: 'edge', shape: s, idx: 3 } },
  { id: 'o', kind: 'con', type: 'coincident', a: { kind: 'pt', shape: s, idx: 0 }, b: { kind: 'origin' } },
  { id: 'w', kind: 'dim', type: 'len', a: { kind: 'edge', shape: s, idx: 0 }, value: 80, name: 'd1', expr: '80' }, { id: 'hh', kind: 'dim', type: 'len', a: { kind: 'edge', shape: s, idx: 1 }, value: 40, name: 'd2', expr: '40' }]
const seed = (x) => useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchTool: 'select', sketchProfiles: [], sketchShape: null, skCons: [], appConfirm: async () => true, ...x }, true)

test('Mirror works on a dimensioned, filleted, origin-anchored gasket (points on the axis join, no English conflict)', async () => {
  seed({ sketchTool: 'cfillet', sketchProfiles: [{ type: 'circle', c: [20, 20], r: 5 }], sketchShape: { type: 'rect', a: [0, 0], b: [80, 40] }, skCons: [...rectCons(1), { id: 'dia', kind: 'dim', type: 'dia', a: { kind: 'circle', shape: 0 }, value: 10, name: 'd3' }, { id: 'cx', kind: 'dim', type: 'hdist', a: { kind: 'origin' }, b: { kind: 'pt', shape: 0, idx: 0 }, value: 20, name: 'd4' }, { id: 'cy', kind: 'dim', type: 'vdist', a: { kind: 'origin' }, b: { kind: 'pt', shape: 0, idx: 0 }, value: 20, name: 'd5' }] })
  await g().resolveSk()
  await g().skCornerAt([80, 40]); g().setSketchCornerR(8); await g().skCornerAt([75, 35]); await settle()
  const dof = g().skDof, n = g().sketchProfiles.length + (g().sketchShape ? 1 : 0)
  await g().mirrorSketch('y'); await settle()
  assert.match(g().status, /已鏡像/, g().status)
  assert.ok(!/[A-Za-z]{4,}/.test(g().status.replace(/DOF/g, '')), 'Traditional message, no English')
  assert.equal(g().sketchProfiles.length, n + 2, 'mirror copy + axis line')
  assert.equal(g().skConflict, false); assert.equal(g().skDof, dof, 'copy is fully driven by the mirror relation')
  const co = g().skCons.filter((c) => c.type === 'coincident' && String(c.id).includes(':sym:'))
  assert.ok(co.length >= 2, 'source points on the axis become coincident with their copies')
})

test('Trim removes only the clicked piece of one rect edge (stops at the corner), keeps H/V + untouched dims, adds point-on-line', async () => {
  for (const [click, removed] of [[[0, 35], [[0, 30], [0, 40]]], [[0, 10], [[0, 0], [0, 30]]], [[40, 40], [[10, 40], [80, 40]]]]) {
    seed({ sketchTool: 'trim', sketchProfiles: [{ type: 'poly', pts: [[0, 0], [80, 0], [80, 40], [0, 40]], verts: [[0, 0], [80, 0], [80, 40], [0, 40]], bulges: [0, 0, 0, 0] }, { type: 'circle', c: [0, 40], r: 10 }], skCons: rectCons(0) })
    await g().skTrimAt(click); await settle()
    const path = g().sketchProfiles.find((s) => s.type === 'poly')
    assert.equal(path.open, true, g().status)
    assert.equal(path.verts.length, 5, `only one piece removed: ${JSON.stringify(path.verts)}`)
    const ends = [path.verts[0], path.verts[4]].map((p) => p.map((v) => Math.round(v * 1e6) / 1e6))
    assert.deepEqual(ends.sort(), removed.map((p) => [...p]).sort(), JSON.stringify(path.verts))
    const kinds = g().skCons.map((c) => c.type)
    assert.ok(kinds.filter((k) => k === 'h' || k === 'v').length >= 4, `H/V kept: ${kinds}`)
  }
  // 底邊冇郁 → 寬度尺寸 d1 仍在
  assert.ok(g().skCons.some((c) => c.id === 'w'), 'untouched edge keeps its dimension')
})

test('Trim with no cutter on a rectangle deletes just that edge (Fusion lines), not the whole rectangle', async () => {
  seed({ sketchTool: 'trim', sketchProfiles: [{ type: 'rect', a: [0, 0], b: [60, 30] }] })
  await g().skTrimAt([30, 0])
  const p = g().sketchProfiles[0]
  assert.ok(p && p.open && p.verts.length === 4, JSON.stringify(g().sketchProfiles))
})

test('Finish edited sketch: dimension 80→100 applies to the extrude (region selection survives)', async () => {
  for (const stale of [false, true]) {
    useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)
    const P = [[0, 0], [80, 0], [80, 40], [0, 40]]
    useApp.setState({ mode: 'sketch', sketchPlane: 'XY', sketchProfiles: [{ type: 'poly', pts: P, verts: P, bulges: [0, 0, 0, 0] }, { type: 'circle', c: [20, 20], r: 5 }, { type: 'circle', c: [60, 20], r: 5 }], sketchShape: null, skCons: rectCons(0), sketchOp: 'new' })
    await g().resolveSk()
    g().openExtrudeDlg()
    const big = g().extrudeRegionFaces.map((f, i) => [f.holes.length, i]).sort((a, b) => b[0] - a[0])[0][1]
    g().toggleExtrudeRegion(big); useApp.setState({ extrudeHeight: 5 }); await g().extrudeSketch()
    assert.equal(g().mode, 'model', g().status)
    const f = g().features.find((x) => x.type === 'extrude' || x.type === 'extgroup'), id = f.sketchId
    assert.equal(g().sketchSources[id].regionSelection.length, 1)
    if (stale) { // 模擬舊簽名（舊版本段序不同）：同一個輪廓 + 孔數 → 要跟返同一個 profile
      const src = g().sketchSources[id], P5 = [[0, 0], [40, 0], [80, 0], [80, 40], [0, 40]]
      useApp.setState({ sketchSources: { ...g().sketchSources, [id]: { ...src, regionSelection: ['0:0:1|0:1:1|0:2:1|0:3:1|0:4:1'], shapes: src.shapes.map((sh, i) => i === 0 ? { ...sh, pts: P5, verts: P5, bulges: [0, 0, 0, 0, 0] } : sh) } } })
    }
    await g().editSketchOf(f.id)
    if (stale) useApp.setState({ sketchProfiles: g().sketchProfiles.map((sh, i) => i === 0 ? { type: 'poly', pts: P, verts: P, bulges: [0, 0, 0, 0] } : sh) })
    await g().editSkDim('w', 100)
    await g().applySketchEdit(id)
    assert.equal(g().mode, 'model'); assert.doesNotMatch(g().status, /失敗/, g().status)
    const xs = g().features.filter((x) => x.type === 'extrude').flatMap((x) => (x.profile.pts || []).map((p) => p[0]))
    assert.ok(Math.max(...xs) > 99, `extrude follows the 100 mm edit (stale=${stale}): ${Math.max(...xs)}`)
  }
})
