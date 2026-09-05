// history-probe2.test.mjs — γ批 B1 端到端身份追踪实证：Modified() 列表读得返 shape 出嚟？
// 读返嘅 face 可唔可以同【布尔结果体】嘅 face 用 IsSame 配对？（S2 lineage 可用性铁证）
// 跑法: npx -y tsx tests/history-probe2.test.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, cast } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? '✅' : '❌'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }

const a = makeBaseBox(40, 30, 20)
const b = makeBaseBox(16, 16, 40).translate([12, 7, -10])
const aFaceTop = a.faces.find((f) => Math.abs(f.center.z - 20) < 1e-6)
const mk = new OC.BRepAlgoAPI_Cut_3(a.wrapped, b.wrapped, new OC.Message_ProgressRange_1())
try { mk.Build(new OC.Message_ProgressRange_1()) } catch { mk.Build() }
const done = mk.IsDone()
const resShape = mk.Shape()
const res = cast(resShape)
report('cut.done+result', done && res && res.faces.length > 6, { done, resultFaces: res?.faces?.length })

// ── First() 读 shape 深检 ──
const lst = mk.Modified(aFaceTop.wrapped)
const n = (typeof lst.Size === 'function' ? lst.Size() : lst.Extent?.()) ?? -1
let first = null, firstInfo = {}
try {
  first = lst.First_1 ? lst.First_1() : lst.First()
  firstInfo = { got: !!first, isNullFn: typeof first?.IsNull, isNull: (() => { try { return first.IsNull() } catch (e) { return 'threw:' + (e?.message || e) } })(), shapeType: (() => { try { return first.ShapeType?.() ?? first.ShapeType } catch (e) { return 'threw' } })() }
} catch (e) { firstInfo = { threw: e?.message || String(e) } }
report('modified.First-readback', !!first && firstInfo.isNull === false, { n, ...firstInfo, methods: first ? Object.getOwnPropertyNames(Object.getPrototypeOf(first)).slice(0, 12) : [] })

// ── 身份配对：Modified 输出 face 同结果体逐 face IsSame/IsEqual/IsPartner ──
if (first) {
  const cmp = { IsSame: -1, IsEqual: -1, IsPartner: -1 }
  for (const m of ['IsSame', 'IsEqual', 'IsPartner']) {
    if (typeof first[m] !== 'function') { cmp[m] = 'no-fn'; continue }
    let hit = -1
    for (let i = 0; i < res.faces.length; i++) { try { if (first[m](res.faces[i].wrapped)) { hit = i; break } } catch { cmp[m] = 'threw'; hit = -2; break } }
    if (hit >= -1) cmp[m] = hit
  }
  const anyHit = ['IsSame', 'IsEqual', 'IsPartner'].some((m) => typeof cmp[m] === 'number' && cmp[m] >= 0)
  report('modified→result face 配对', anyHit, cmp)
  // 语义 sanity：配对中嘅面应该系「开咗洞嘅顶面」——面积应 < 原顶面（40×30=1200）
  const hitIdx = ['IsSame', 'IsEqual', 'IsPartner'].map((m) => cmp[m]).find((v) => typeof v === 'number' && v >= 0)
  if (hitIdx != null && hitIdx >= 0) {
    const g = new OC.GProp_GProps_1(); OC.BRepGProp.SurfaceProperties_1(res.faces[hitIdx].wrapped, g, false, false)
    const area = g.Mass()
    report('配对面语义（顶面开洞 → 面积 < 1200）', area < 1200 - 1 && area > 0, { hitIdx, area: +area.toFixed(1), expectApprox: 1200 - 16 * 16 })
  }
}

console.log(`\n== history-probe2: ${pass} pass / ${fail} fail ==`)
process.exit(fail ? 1 : 0)
