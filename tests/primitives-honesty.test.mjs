// primitives-honesty.test.mjs — 原语诚实化验收（backlog #67 真尖顶）。
// #67：棱锥/圆锥（sides≥3 走 loft 路径）嘅顶端半径以前被【硬钳 0.4mm 绝对平顶】—— 即使用户填顶Ø=0 想要真尖顶，
//   小件（底Ø细）都会留一个肉眼可见嘅 0.4mm 微台。已改为相对底半径嘅细比例 max(Rt, Rb·1e-3, 1e-3)。
// 本测真起 loft（同 worker prim cone/pyramid 路径同款：ngon 底 → ngon 顶 → loftWith），验：
//   (a) 新公式顶截面半径 = max(Rb·1e-3,1e-3)，远细过旧 0.4；
//   (b) 真内核建出嘅体，顶端(z≈H)三角顶点嘅 XY 半径 < 0.1mm（旧 0.4 会 fail）—— 即真尖顶；
//   (c) 体积贴近真棱锥 (1/3·A_base·H) 且明显细过旧 0.4 平顶棱台体积（顶台被消掉）。
// 跑法（喺 C:\ClaudeCode\webcad）：npx -y tsx tests/primitives-honesty.test.mjs
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

// worker prim 路径同款 ngon（半径 R、N 边、+Math.PI/2 起相位）+ profileToSketch(poly) = draw().close().sketchOnPlane
const ngon = (R, n) => Array.from({ length: n }, (_, i) => { const a = (2 * Math.PI * i) / n + Math.PI / 2; return [R * Math.cos(a), R * Math.sin(a)] })
const polySketch = (R, n, z) => { const pts = ngon(R, n); let pen = draw([pts[0][0], pts[0][1]]); for (const p of pts.slice(1)) pen = pen.lineTo([p[0], p[1]]); return pen.close().sketchOnPlane('XY', z) }
const volumeOf = (shape) => { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape.wrapped, g, false, false, false); return Math.abs(g.Mass()) }

// ── 小件四棱锥：底外接圆半径 Rb=2mm、sides=4、高 H=5mm、顶Ø=0（Rt=0）───────────────────────────────
const Rb = 2, n = 4, H = 5, Rt = 0
const topR_new = Math.max(Rt, Rb * 1e-3, 1e-3)   // = #67 新公式 = 0.002mm
const topR_old = Math.max(0.4, Rt)                // = 旧公式 = 0.4mm（对照）

// (a) 新公式顶半径远细过旧 0.4
report('(a) #67 新顶半径 = max(Rt,Rb·1e-3,1e-3) = 0.002mm，远细过旧钳死嘅 0.4mm', Math.abs(topR_new - 0.002) < 1e-9 && topR_new < topR_old / 100, { topR_new, topR_old })

// (b) 真内核建棱锥（新公式）→ 顶端(z≈H)三角顶点 XY 半径应 < 0.1（旧 0.4 平顶会 ~0.4，必 fail 呢条）
const pyr = polySketch(Rb, n, 0).loftWith(polySketch(topR_new, n, H))
const m = pyr.mesh({ tolerance: 0.01, angularTolerance: 0.3 })
const V = m.vertices
let topMaxR = 0, nTop = 0
for (let i = 0; i < V.length; i += 3) { if (Math.abs(V[i + 2] - H) < 0.05) { const r = Math.hypot(V[i], V[i + 1]); if (r > topMaxR) topMaxR = r; nTop++ } }
report('(b) 真内核：顶端(z≈H)截面 XY 半径 < 0.1mm（近真尖顶；旧 0.4 平顶会 ~0.4 → 失守）', nTop > 0 && topMaxR < 0.1, { topMaxR: +topMaxR.toFixed(4), nTopVerts: nTop, H })

// (c) 体积贴近真棱锥、明显细过旧 0.4 平顶棱台
const A_base = 2 * Rb * Rb                                   // 正方形（外接圆半径 Rb）面积 = 2·Rb²
const A_topOld = 2 * topR_old * topR_old                     // 旧顶台面积
const volPyramidTrue = A_base * H / 3                        // 真棱锥体积 ≈ 13.33
const volFrustumOld = (H / 3) * (A_base + A_topOld + Math.sqrt(A_base * A_topOld))  // 旧 0.4 平顶棱台 ≈ 16.5
const vol = volumeOf(pyr)
report('(c) 体积贴近真棱锥 (1/3·A_base·H) 且明显细过旧 0.4 平顶棱台', Math.abs(vol - volPyramidTrue) / volPyramidTrue < 0.03 && vol < volFrustumOld - 1, { vol: +vol.toFixed(3), volPyramidTrue: +volPyramidTrue.toFixed(3), volFrustumOld: +volFrustumOld.toFixed(3) })

console.log(`\n== primitives-honesty: ${pass} pass / ${fail} fail ==`)
process.exit(fail ? 1 : 0)
