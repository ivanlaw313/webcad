// 内核换装几何 battery —— 换 wasm 之后【现有几何必须逐位不变】。
//
// 点解唔照抄 BUILD_CAD2.md 嗰 7 个历史数字：嗰啲数只记录咗结果，冇记录参数
// （fillet_r5 = 边拣边？chamfer_3 = 拣边规则？），凭数字反推参数系估。
// 差分测试更强：【同一份脚本】跑新旧两个内核，逐位比对。参数由脚本自己定死，
// 唔使估，而且覆盖面可以扩阔。
//
// 用法：
//   KERNEL_DIR=src/kernel            node --experimental-strip-types tests/kernel-battery.mjs > old.json
//   KERNEL_DIR=_occt-build/_rebuilt  node --experimental-strip-types tests/kernel-battery.mjs > new.json
//   node tests/kernel-battery.mjs --diff old.json new.json
//
// ⚠ 体积/面积用【full f64 精度】输出（唔 toFixed）—— 换核如果动咗 OCCT 数学，
//   差异多数喺尾几位先见到，round 咗就验唔到。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'

/* ── --diff 模式：唔载内核，纯比对两份 JSON ───────────────────────────── */
if (process.argv[2] === '--diff') {
  const a = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'))
  const b = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'))
  const keys = [...new Set([...Object.keys(a.cases), ...Object.keys(b.cases)])].sort()
  let bad = 0
  console.log(`旧内核 ${a.kernel.wasmBytes} B  ·  新内核 ${b.kernel.wasmBytes} B`)
  console.log(`旧 FitWrapper ${a.kernel.hasFitWrapper}  ·  新 FitWrapper ${b.kernel.hasFitWrapper}`)
  console.log('')
  console.log('case                      | 体积 (旧 → 新)                        | 三角 | 面/边 | 判定')
  console.log('-'.repeat(104))
  for (const k of keys) {
    const x = a.cases[k], y = b.cases[k]
    if (!x || !y) { console.log(`${k.padEnd(25)} | ${!x ? '旧核冇' : '新核冇'.padEnd(38)} | — | — | ❌ 缺失`); bad++; continue }
    if (x.error || y.error) {
      const same = x.error === y.error
      console.log(`${k.padEnd(25)} | 两核同样出错: ${String(x.error).slice(0, 40)} | — | — | ${same ? '⚠ 同错' : '❌ 错唔同'}`)
      if (!same) bad++
      continue
    }
    // 逐位（f64 完全相等）—— 唔畀容差，换核唔应该郁到任何一位
    const vSame = Object.is(x.volume, y.volume)
    const aSame = Object.is(x.area, y.area)
    const tSame = x.tris === y.tris
    const topoSame = x.faces === y.faces && x.edges === y.edges
    const allSame = vSame && aSame && tSame && topoSame
    if (!allSame) bad++
    const vTxt = vSame ? `${x.volume}` : `${x.volume} → ${y.volume}`
    console.log(`${k.padEnd(25)} | ${vTxt.padEnd(37)} | ${String(x.tris).padStart(4)} | ${x.faces}/${x.edges} | ${allSame ? '✅' : '❌ ' + [!vSame && '体积', !aSame && '面积', !tSame && '三角', !topoSame && '拓扑'].filter(Boolean).join('+')}`)
  }
  console.log('')
  console.log(bad === 0 ? `✅ ALL IDENTICAL —— ${keys.length} 个 case 逐位相同，换核安全` : `❌ ${bad}/${keys.length} 个 case 唔一致 —— 唔准部署`)
  process.exit(bad === 0 ? 0 : 1)
}

/* ── 量测模式 ──────────────────────────────────────────────────────────── */
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))

const KDIR = process.env.KERNEL_DIR || 'src/kernel'
const jsUrl = new URL(`../${KDIR}/replicad_plus.js`, import.meta.url)
const wasmPath = fileURLToPath(new URL(`../${KDIR}/replicad_plus.wasm`, import.meta.url))

const rc = await import('replicad')
const { setOC, makeBaseBox, makeCylinder, makeSphere, cast } = rc
const { default: opencascade } = await import(jsUrl.href)
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)

const volume = (s) => { const p = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(s.wrapped, p, false, false, false); return Math.abs(p.Mass()) }
const area = (s) => { const p = new OC.GProp_GProps_1(); OC.BRepGProp.SurfaceProperties_1(s.wrapped, p, false, false); return Math.abs(p.Mass()) }
const countTopo = (s, kind) => {
  const ex = new OC.TopExp_Explorer_2(s.wrapped, OC.TopAbs_ShapeEnum[kind], OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
  let n = 0
  for (; ex.More(); ex.Next()) n++
  return n
}

const cases = {}
const measure = (name, build) => {
  try {
    const s = build()
    const m = s.mesh({ tolerance: 0.1, angularTolerance: 0.3 })
    cases[name] = {
      volume: volume(s),
      area: area(s),
      tris: m.triangles.length / 3,
      verts: m.vertices.length / 3,
      faces: countTopo(s, 'TopAbs_FACE'),
      edges: countTopo(s, 'TopAbs_EDGE'),
    }
  } catch (e) {
    cases[name] = { error: String(e && e.message || e).slice(0, 120) }
  }
}

/* 7 个 case 对应 BUILD_CAD2.md 嗰 7 类（参数由本脚本定死，唔靠反推） */
measure('box_40x30x20', () => makeBaseBox(40, 30, 20))
measure('fillet_r5_zedges', () => makeBaseBox(40, 30, 20).fillet(5, (e) => e.inDirection('Z')))
measure('sphere_r18', () => makeSphere(18))
// ⚠ replicad 冇 export makeTorus（实测：只有 revolution）。环面系一个【独立嘅曲面类型】
//   (Geom_ToroidalSurface)，box/cyl/sphere 覆盖唔到，所以直接行 OCCT 原生 primitive 再 cast 返。
measure('torus_R20_r6', () => cast(new OC.BRepPrimAPI_MakeTorus_1(20, 6).Shape()))
// 全边圆角：角位会出【环面 + 球面】补丁 —— 同 torus 一齐守住曲面求交呢条路
measure('fillet_r3_alledges', () => makeBaseBox(40, 30, 20).fillet(3))
measure('chamfer_3_zedges', () => makeBaseBox(40, 30, 20).chamfer(3, (e) => e.inDirection('Z')))
measure('box_cut_sphere_r14', () => makeBaseBox(40, 30, 20).cut(makeSphere(14)))
measure('shell_2_topopen', () => { const b = makeBaseBox(40, 30, 20); return b.shell(2, (f) => f.inPlane('XY', b.boundingBox.bounds[1][2])) })

/* 再加几个覆盖改核【真正会碰】嘅路径（G1 补面 / 布尔 / 扫掠 / STEP） */
measure('cyl_r10_h40', () => makeCylinder(10, 40))
measure('fillet_then_shell_then_cut', () => {
  const f = makeBaseBox(50, 40, 30).fillet(3, (e) => e.inDirection('Z'))
  const sh = f.shell(2, (fc) => fc.inPlane('XY', f.boundingBox.bounds[1][2]))
  return sh.cut(makeCylinder(4, 50).translate([25, 20, -10]))
})
measure('fuse_box_cyl', () => makeBaseBox(40, 30, 20).fuse(makeCylinder(8, 40).translate([20, 15, 0])))
measure('sphere_cut_cyl_cross', () => makeSphere(15).cut(makeCylinder(5, 60).translate([0, 0, -30])))

/* 内核能力探针：新核应该有 FitWrapper，旧核冇 —— 呢个【预期唔同】，唔计入几何差异 */
const hasFitWrapper = typeof OC.FitWrapper !== 'undefined'
const hasPlateWrapper = typeof OC.PlateWrapper !== 'undefined'
const fitMethods = hasFitWrapper
  ? ['MakeAnalyticFace', 'FitBSplineFace', 'TrimFaceByLoop', 'SewSolidify', 'FreeBoundaryInfo', 'DeviationSample']
      .filter((m) => typeof OC.FitWrapper[m] === 'function')
  : []

console.log(JSON.stringify({
  kernel: {
    dir: KDIR,
    wasmBytes: fs.statSync(wasmPath).size,
    hasFitWrapper, hasPlateWrapper, fitMethods,
  },
  cases,
}, null, 2))
