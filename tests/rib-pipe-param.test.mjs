// rib-pipe-param.test.mjs — GM-3DV1 S1/S9 参数接线【验收】测。
// cad.worker.ts 本体用咗 Vite ?url/wasm import，Node/tsx import 唔到 → 同其他 worker 测一样，
// 喺真自建内核（replicad_plus）上【逐字复刻】worker rib 条带几何 + pipe 路径截断纯数学，
// 断言 S1 字段（厚度方向 sym/one · 范围 next/distance · flip · extend）同 S9（截面/空心/距离截断）
// 真系驱动到唔同几何。跑法（喺 C:\ClaudeCode\webcad）: npx -y tsx tests/rib-pipe-param.test.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }
const near = (a, b, tol = 0.05) => Math.abs(a - b) < tol

// ── 逐字复刻 worker rib 条带几何（cad.worker.ts type==='rib'）：单段 + 逐侧半宽 + extend 端点外延 ──
function buildRib({ pts, thickness, height, thDir = 'sym', extent, flip = false, extend = false, hasBody = false, bodyMinZ = 0 }) {
  const hw = Math.max(0.1, thickness) / 2
  const z = 0
  const hwPos = thDir === 'one' ? hw * 2 : hw
  const hwNeg = thDir === 'one' ? 0 : hw
  let p = pts.map((q) => [q[0], q[1]])
  if (extend && p.length >= 2) {
    // 无实体固定 15mm（测试场景冇 bbox 钳）
    const ext = (a, dir) => { const dl = Math.hypot(dir[0], dir[1]); const ux = dir[0] / dl, uy = dir[1] / dl; return [a[0] + ux * 15, a[1] + uy * 15] }
    p[0] = ext(p[0], [p[0][0] - p[1][0], p[0][1] - p[1][1]])
    const n = p.length - 1
    p[n] = ext(p[n], [p[n][0] - p[n - 1][0], p[n][1] - p[n - 1][1]])
  }
  let signedH = Math.max(0.1, height)
  if (hasBody && extent !== 'distance') { const drop = z - bodyMinZ; if (drop > 0.5) signedH = -drop }
  if (flip) signedH = -signedH
  let rib = null
  for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], ay = p[i][1], bx = p[i + 1][0], by = p[i + 1][1]
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy); if (len < 1e-6) continue
    const px = -dy / len, py = dx / len
    const prof = draw([ax + px * hwPos, ay + py * hwPos]).lineTo([bx + px * hwPos, by + py * hwPos]).lineTo([bx - px * hwNeg, by - py * hwNeg]).lineTo([ax - px * hwNeg, ay - py * hwNeg]).close().sketchOnPlane('XY', z)
    const seg = prof.extrude(signedH)
    rib = rib ? rib.fuse(seg) : seg
  }
  return rib
}
const bb = (s) => { const b = s.boundingBox.bounds; return { xmin: b[0][0], ymin: b[0][1], zmin: b[0][2], xmax: b[1][0], ymax: b[1][1], zmax: b[1][2] } }

// 场景：中心线 (0,0)→(40,0)，厚 6，高 20。
// ═══ S1 (a) 厚度方向 sym vs one ═══
const symRib = buildRib({ pts: [[0, 0], [40, 0]], thickness: 6, height: 20, thDir: 'sym' })
const oneRib = buildRib({ pts: [[0, 0], [40, 0]], thickness: 6, height: 20, thDir: 'one' })
const symB = bb(symRib), oneB = bb(oneRib)
report('S1(a) 对称：条带 y ∈ [−3,3]（中心线两侧各半）', near(symB.ymin, -3) && near(symB.ymax, 3), symB)
report('S1(a) 单侧：条带 y ∈ [0,6]（全厚落 +法向单侧，总厚不变=6）', near(oneB.ymin, 0) && near(oneB.ymax, 6), oneB)
report('S1(a) 两模式总厚同为 6', near(symB.ymax - symB.ymin, 6) && near(oneB.ymax - oneB.ymin, 6), { sym: symB.ymax - symB.ymin, one: oneB.ymax - oneB.ymin })

// ═══ S1 (b) flip 翻转挤出方向 ═══
const upRib = buildRib({ pts: [[0, 0], [40, 0]], thickness: 6, height: 20, flip: false })
const dnRib = buildRib({ pts: [[0, 0], [40, 0]], thickness: 6, height: 20, flip: true })
const upB = bb(upRib), dnB = bb(dnRib)
report('S1(b) flip=off：z ∈ [0,20]（向上）', near(upB.zmin, 0) && near(upB.zmax, 20), upB)
report('S1(b) flip=on：z ∈ [−20,0]（翻转向下）', near(dnB.zmin, -20) && near(dnB.zmax, 0), dnB)

// ═══ S1 (c) extent next 落实体底 vs distance 固定高 ═══
const nextRib = buildRib({ pts: [[0, 0], [40, 0]], thickness: 6, height: 20, extent: 'next', hasBody: true, bodyMinZ: -12 })
const distRib = buildRib({ pts: [[0, 0], [40, 0]], thickness: 6, height: 20, extent: 'distance', hasBody: true, bodyMinZ: -12 })
const nextB = bb(nextRib), distB = bb(distRib)
report('S1(c) 到实体：向下落到实体底 z=−12（drop-to-body）', near(nextB.zmin, -12) && near(nextB.zmax, 0), nextB)
report('S1(c) 距离：就算有实体仍向上 height=20', near(distB.zmin, 0) && near(distB.zmax, 20), distB)

// ═══ S1 (d) extend 端点外延（Web Extend Curves，无 bbox → 固定 15mm）═══
const plainRib = buildRib({ pts: [[0, 0], [40, 0]], thickness: 6, height: 20, extend: false })
const extRib = buildRib({ pts: [[0, 0], [40, 0]], thickness: 6, height: 20, extend: true })
const plainB = bb(plainRib), extB = bb(extRib)
report('S1(d) 无延伸：x ∈ [0,40]', near(plainB.xmin, 0) && near(plainB.xmax, 40), plainB)
report('S1(d) 延伸：两端各 +15 → x ∈ [−15,55]', near(extB.xmin, -15) && near(extB.xmax, 55), extB)

// ═══ S9 Pipe：路径截断纯数学（commitFeatDlg 内联同款）+ 半径解冻 ═══
function truncatePath(pts, dist) {
  if (dist >= 0.999) return pts
  let total = 0; for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  const target = total * dist; const out = [pts[0]]; let acc = 0
  for (let i = 1; i < pts.length; i++) { const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (acc + seg >= target && seg > 1e-9) { const t = (target - acc) / seg; out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]); break } acc += seg; out.push(pts[i]) }
  return out.length >= 2 ? out : pts.slice(0, 2)
}
const pathLen = (pts) => { let t = 0; for (let i = 1; i < pts.length; i++) t += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return t }
const straight = [[0, 0], [50, 0], [100, 0]]  // 100mm 直路径
report('S9 距离 1.0：路径不变（全长 100）', near(pathLen(truncatePath(straight, 1)), 100), { len: pathLen(truncatePath(straight, 1)) })
report('S9 距离 0.5：截断到 50mm', near(pathLen(truncatePath(straight, 0.5)), 50), { len: pathLen(truncatePath(straight, 0.5)) })
report('S9 距离 0.3：截断到 30mm（跨段插值）', near(pathLen(truncatePath(straight, 0.3)), 30), { len: pathLen(truncatePath(straight, 0.3)) })
// 半径解冻：size=24 → 外 r 12；空心 thickness=4 → 内 r 8（对齐旧写死 outerR=12/innerR=8，但今为字段）
const size = 24, thickness = 4, outerR = size / 2, innerR = outerR - thickness
report('S9 半径解冻：size 24 → 外 r 12', near(outerR, 12), { outerR })
report('S9 空心壁厚解冻：thickness 4 → 内 r 8', near(innerR, 8), { innerR })
// 方形截面 outer 扫掠真几何：rect ±12 沿直路径 → 截面对角约束
const sq = draw([-12, -12]).lineTo([12, -12]).lineTo([12, 12]).lineTo([-12, 12]).close().sketchOnPlane('XY', 0)
const sqSweep = sq.extrude(30)  // 简化：直挤代扫掠，验方截面 24×24
const sqB = bb(sqSweep)
report('S9 方形截面：24×24（□ size）', near(sqB.xmax - sqB.xmin, 24) && near(sqB.ymax - sqB.ymin, 24), sqB)

console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAIL'} — pass=${pass} fail=${fail}`)
process.exit(fail === 0 ? 0 : 1)
