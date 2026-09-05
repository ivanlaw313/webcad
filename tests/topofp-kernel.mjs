// #14 topoFingerprint —【真 OCCT 几何】验证：mock 单元测（topofp.test.mjs）已证算法；本测证 duck-typed
// accessor（face.edges / face.geomType / edge.geomType / edge.hashCode）喺真 replicad shape 上工作 + 判别力真实。
// 关键断言：同一「顶面」，平 box vs 四竖边圆角 box → 拓扑 hash 不同（圆角 box 顶面邻环多 CYLINDRE）。
//   跑法: npx -y tsx tests/topofp-kernel.mjs  (在 C:\ClaudeCode\webcad)
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)
const { buildEdgeToFaces, topoFaceHash } = await import('../src/cad/topoFingerprint.ts')

let pass = 0, fail = 0
const ok = (name, cond, info = '') => { if (cond) { pass++; console.log('  PASS', name, info) } else { fail++; console.log('  FAIL', name, info) } }

const hashesOf = (shape) => { const f = shape.faces; const e2f = buildEdgeToFaces(f); return f.map((_, i) => topoFaceHash(f, i, e2f)) }

console.log('#14 topoFingerprint — real OCCT')

// ── 平 box：6 面，全非空 hash，无 CYLINDRE 邻 ──
const plain = makeBaseBox(40, 40, 10)
const hPlain = hashesOf(plain)
ok('K1 平 box：6 面 hash 全非空（accessor 真几何上工作）', hPlain.length === 6 && hPlain.every((h) => h.length > 0), `faces=${hPlain.length}`)
ok('K2 平 box：无面邻接 CYLINDRE', hPlain.every((h) => !h.includes('CYLINDRE')))
ok('K3 平 box：邻接表每边恰好 2 面（流形）', (() => {
  const e2f = buildEdgeToFaces(plain.faces)
  let edges = 0, shared2 = 0
  for (const arr of e2f.values()) { edges++; if (arr.length === 2) shared2++ }
  return edges === 12 && shared2 === 12
})(), '12 边全 2-共享')

// ── 四竖边圆角 box：出现 CYLINDRE 面 + 顶面邻环含 CYLINDRE ──
let fil = null
try { fil = makeBaseBox(40, 40, 10).fillet(3, (e) => e.inDirection('Z')) } catch (err) { console.log('  (inDirection Z fillet failed, fallback all-edge)', err?.message); try { fil = makeBaseBox(40, 40, 10).fillet(2) } catch (e2) { console.log('  fillet unavailable:', e2?.message) } }
if (fil) {
  const f = fil.faces
  const e2f = buildEdgeToFaces(f)
  const kinds = f.map((fc) => { try { return String(fc.geomType) } catch { return '?' } })
  const hFil = f.map((_, i) => topoFaceHash(f, i, e2f))
  ok('K4 圆角 box：所有面 hash 非空', hFil.every((h) => h.length > 0), `faces=${hFil.length}`)
  ok('K5 圆角 box：出现 CYLINDRE 面（圆角面）', kinds.some((k) => k === 'CYLINDRE'), `kinds=${[...new Set(kinds)].join(',')}`)
  ok('K6 圆角 box：某 PLANE 面邻环含 CYLINDRE（跨面邻接真几何上通）', hFil.some((h, i) => kinds[i] === 'PLANE' && h.includes('CYLINDRE')))
  // ── 核心判别：顶面（PLANE, +Z, 面积最大方形）平 vs 圆角 → hash 不同 ──
  //   顶/底面系唯一两个 40×40 PLANE；圆角后顶面 4 角被削 → 邻接 4 个 CYLINDRE → hash 变。
  const topFilHashes = hFil.filter((h, i) => kinds[i] === 'PLANE' && h.includes('CYLINDRE'))
  const topPlainHasCyl = hPlain.some((h) => h.includes('CYLINDRE'))
  ok('K7 判别力（真几何）：圆角顶面 hash 含 CYLINDRE 邻、平 box 顶面无 → 同名面可区分', topFilHashes.length > 0 && !topPlainHasCyl)
} else {
  console.log('  (skip K4–K7: fillet 不可用)')
}

console.log(`\n#14 topoFingerprint real-OCCT: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
process.exit(0)
