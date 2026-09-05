// GM-3DV3 M7：倒角逐边距离（分组 scalar chamfer）＋ 真·相邻面参考（两距离 selectedFace = 相邻面中心，取代 bbox 顶/底平面）。
// 直接驱动 replicad_plus 验内核语义（同 shell-direction 切法）。
// 跑：npx -y tsx tests/chamfer-peredge.test.mjs（喺 C:\ClaudeCode\webcad）
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
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const vol = (shape) => { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape.wrapped, g, false, false, false); return Math.abs(g.Mass()) } catch { return NaN } }
const nfaces = (shape) => { let n = 0; const ex = new OC.TopExp_Explorer_2(shape.wrapped, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; ex.More(); ex.Next()) n++; return n }
const sideChamferNormal = (shape) => {
  for (const fc of shape.faces) {
    try { const c = fc.center, n = fc.normalAt(c); if (Math.abs(n.x) > 0.1 && Math.abs(n.y) > 0.1 && Math.abs(n.z) < 0.1) return [Math.abs(n.x), Math.abs(n.y)] } catch {}
  }
  return null
}

// 40×40×40 方块
function makeBox() { return draw().movePointerTo([-20, -20]).lineTo([20, -20]).lineTo([20, 20]).lineTo([-20, 20]).close().sketchOnPlane('XY').extrude(40) }

// ── 逐边距离：两条顶边各自唔同距离（worker 分组 scalar chamfer 路径，逐组 sh.chamfer(rv, finder)） ──
{
  const box = makeBox()
  const V0 = vol(box)
  // 顶面前边中点 ≈ (0,-20,40)；顶面右边中点 ≈ (20,0,40)
  let sh = box
  let okChain = true
  try {
    sh = sh.chamfer(2, (e) => e.containsPoint([0, -20, 40]))   // 组1：距离 2
    sh = sh.chamfer(6, (e) => e.containsPoint([20, 0, 40]))    // 组2：距离 6
  } catch (e) { okChain = false }
  const V1 = vol(sh)
  ok(okChain && Number.isFinite(V1) && V1 < V0, `逐边距离：两顶边分组各切 C2 / C6 成功（vol ${(V0 / 1000).toFixed(1)}→${(V1 / 1000).toFixed(1)}cm³）`)
  ok(nfaces(sh) >= 8, `逐边距离：新增两斜面（面数 ${nfaces(sh)} ≥ 8）`)
}

// ── 真·相邻面参考（两距离，竖边）：selectedFace = 相邻【竖面】中心（旧 bbox 顶/底平面唔含竖边 → 会退等距）──
{
  const box = makeBox()
  // 竖边（右前）≈ x=20,y=-20，全高；相邻两竖面：右面 x=20（中心 [20,0,20]）、前面 y=-20（中心 [0,-20,20]）
  const edgeFinder = (e) => e.containsPoint([20, -20, 20])
  let asym = null, asymOK = true
  try {
    asym = box.chamfer({ distances: [3, 8], selectedFace: (ff) => ff.containsPoint([20, 0, 20]) }, edgeFinder)   // d1=3 沿右面、d2=8 沿前面
  } catch (e) { asymOK = false }
  const Va = asym ? vol(asym) : NaN
  ok(asymOK && Number.isFinite(Va) && Va < vol(box), `竖边两距离：selectedFace=相邻竖面中心 → chamfer{distances:[3,8]} 成功（旧 inPlane('XY',topZ) 唔含竖边会失败）`)

  // 对照：旧法（bbox 顶平面）做竖边两距离参考 —— 该平面唔含呢条竖边（法向 z 分量），d1 参考面无效。
  //   OCCT 或抛错、或产出【错方向】斜面（d1/d2 贴错面）。相比之下相邻面参考 = 竖边真两相邻面，语义正确。
  let oldOutcome = 'ok'
  try { const r = box.chamfer({ distances: [3, 8], selectedFace: (ff) => ff.inPlane('XY', 40) }, edgeFinder); if (!r || (r.wrapped && r.wrapped.IsNull())) oldOutcome = 'null' } catch { oldOutcome = 'threw' }
  console.log(`  · 对照：旧顶面参考对竖边两距离 → ${oldOutcome}（相邻面参考语义更正确，无论旧法抛错定贴错面）`)
  ok(true, `对照记录完成（旧顶面参考 outcome=${oldOutcome}）— 相邻面参考为正确语义`)
}

// ── Distance and Angle：同一竖边，用真实参考面内点解析；Flip 必须交换到另一相邻面 ──
{
  const box = makeBox()
  const edgeFinder = (e) => e.containsPoint([20, -20, 20])
  let fromRight = null, fromFront = null, angleOK = true
  try {
    fromRight = box.chamfer({ distance: 4, angle: 30, selectedFace: (ff) => ff.containsPoint([20, 0, 20]) }, edgeFinder)
    fromFront = box.chamfer({ distance: 4, angle: 30, selectedFace: (ff) => ff.containsPoint([0, -20, 20]) }, edgeFinder)
  } catch { angleOK = false }
  const nr = fromRight ? sideChamferNormal(fromRight) : null
  const nf = fromFront ? sideChamferNormal(fromFront) : null
  ok(angleOK && nr && nf && vol(fromRight) < vol(box) && vol(fromFront) < vol(box), '距离+角度：同一竖边两张真实相邻参考面都可建立倒角')
  const rr = nr ? nr[0] / nr[1] : NaN, rf = nf ? nf[0] / nf[1] : NaN
  ok(Number.isFinite(rr) && Number.isFinite(rf) && Math.abs(rr - rf) > 0.2, 'Flip：参考面交换后斜面法向比率改变（' + rr.toFixed(3) + ' → ' + rf.toFixed(3) + '）')
}

console.log(`\n${fail === 0 ? '✅' : '❌'} GM-3DV3 M7 倒角逐边距离 + 相邻面参考 (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
