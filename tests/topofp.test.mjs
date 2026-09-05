// #14 topoFingerprint 单元测：拓扑指纹 hash 判别力 + 邻接表 + 退化保护。
// 用 duck-typed mock faces（geomType/edges/hashCode）—— 唔需 wasm，纯算法验证。
import { buildEdgeToFaces, topoFaceHash } from '../src/cad/topoFingerprint.ts'

let pass = 0, fail = 0
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) } }

// ── 模型：对称板（两端面 v1 指纹会撞），一端有圆角（fillet=CYLINDRE 面）另一端平 ──
//   face0 = 有圆角嗰端（跨圆角边邻接 CYLINDRE）；face1 = 平嗰端（邻接全 PLANE）。
//   两者 geomType 都系 PLANE、几何对称 → v1/v2 撞；拓扑指纹应可分（face0 邻环多一个 CYLINDRE）。
// GM-L2 修旧账：源码 edgeGeomKey 已升级用几何量化键（pointAt 中点+端点，取代 OCCT hashCode 桶 hash 跨 solid 碰撞）——
// mock 边必须提供 pointAt；同一边对象喺两张面共用 → 同一几何键 → 邻接成立（同真内核语义一致）。
const mkE = (hc, gt) => ({ hashCode: hc, geomType: gt, pointAt: (t) => ({ x: hc, y: t * 10, z: 0 }) })
const eA = mkE(100, 'CIRCLE')  // 圆角边（face0 ↔ 圆角面 face4）
const eB = mkE(101, 'LINE')    // face0 ↔ 侧面 face2
const eC = mkE(102, 'LINE')    // face1 ↔ 侧面 face2
const eD = mkE(103, 'LINE')    // face1 ↔ 侧面 face3
const faces = [
  { geomType: 'PLANE', edges: [eA, eB] },      // 0：有圆角端
  { geomType: 'PLANE', edges: [eC, eD] },      // 1：平端（v1 同 face0 撞）
  { geomType: 'PLANE', edges: [eB, eC] },      // 2：侧面
  { geomType: 'PLANE', edges: [eD] },          // 3：侧面
  { geomType: 'CYLINDRE', edges: [eA] },       // 4：圆角面
]

const e2f = buildEdgeToFaces(faces)
console.log('#14 topoFingerprint')
// 键系几何量化 hash（内部函数）——唔靠死键值，改验邻接【面集】存在（语义不变：圆角边连 [0,4]、边 101 连 [0,2]）
const vals = [...e2f.values()].map((v) => JSON.stringify(v))
ok('T1 邻接表：圆角边 = 面[0,4]', vals.includes('[0,4]'))
ok('T1b 邻接表：边 101 = 面[0,2]', vals.includes('[0,2]'))

const h0 = topoFaceHash(faces, 0, e2f)
const h1 = topoFaceHash(faces, 1, e2f)
ok('T2 判别力：有圆角端 ≠ 平端（对称体可分）', h0 !== h1)
ok('T2b 稳定：同面重算 hash 一致', topoFaceHash(faces, 0, e2f) === h0)
ok('T2c 有圆角端含 CYLINDRE 邻', h0.includes('CYLINDRE'))
ok('T2d 平端唔含 CYLINDRE 邻', !h1.includes('CYLINDRE'))

// ── canonical：邻接次序无关（renumber-invariant）——同拓扑不同边列顺序应同 hash ──
const facesReorder = [
  { geomType: 'PLANE', edges: [eB, eA] },      // 0 但 edges 反序
  { geomType: 'PLANE', edges: [eC, eD] },
  { geomType: 'PLANE', edges: [eB, eC] },
  { geomType: 'PLANE', edges: [eD] },
  { geomType: 'CYLINDRE', edges: [eA] },
]
ok('T3 canonical：边列顺序无关', topoFaceHash(facesReorder, 0, buildEdgeToFaces(facesReorder)) === h0)

// ── 退化保护：面 .edges 抛错 / geomType 抛错 → 返空串（当 miss，唔崩）──
const bad = [{ get geomType() { throw new Error('boom') }, edges: [] }]
ok('T4 退化：geomType 抛错 → 空串', topoFaceHash(bad, 0, new Map()) === '')
const bad2 = [{ geomType: 'PLANE', get edges() { throw new Error('boom') } }]
ok('T4b 退化：edges 抛错 → 空串', topoFaceHash(bad2, 0, new Map()) === '')
ok('T4c 退化：buildEdgeToFaces 遇抛错面唔崩', (() => { try { buildEdgeToFaces(bad2); return true } catch { return false } })())

// ── 完全对称孪生（诚实边界）：两面邻环一模一样 → hash 相同（预期，落返 near-point）──
const twin = [
  { geomType: 'PLANE', edges: [mkE(200, 'LINE')] },
  { geomType: 'PLANE', edges: [mkE(201, 'LINE')] },
  { geomType: 'PLANE', edges: [mkE(200, 'LINE'), mkE(201, 'LINE')] },
]
const te2f = buildEdgeToFaces(twin)
ok('T5 诚实边界：完全对称孪生 hash 相同（预期撞→退 near）', topoFaceHash(twin, 0, te2f) === topoFaceHash(twin, 1, te2f))

console.log(`\n#14 topoFingerprint: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
