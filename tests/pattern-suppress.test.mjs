// pattern-suppress.test.mjs — GM-3DV1 S3【验收】测：逐实例抑制遮罩 + 环形副本过滤。
// 复刻 worker 矩形/环形阵列抑制逻辑（cad.worker.ts pattern/circPattern），真内核建 fused solid
// 验证被抑制副本【真系冇】（体积少一份），并验 cpAngles 过滤 + 抑制字串解析。
// 跑法（喺 C:\ClaudeCode\webcad）: npx -y tsx tests/pattern-suppress.test.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }
const near = (a, b, tol = 1) => Math.abs(a - b) < tol
// 网格符号体积（同其他测法）
const meshVol = (s) => { const m = s.mesh(); const v = m.vertices, t = m.triangles; let acc = 0; for (let i = 0; i + 2 < t.length; i += 3) { const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3; acc += v[a] * (v[b + 1] * v[c + 2] - v[c + 1] * v[b + 2]) - v[a + 1] * (v[b] * v[c + 2] - v[c] * v[b + 2]) + v[a + 2] * (v[b] * v[c + 1] - v[c] * v[b + 1]) } return Math.abs(acc) / 6 }

// ── 复刻 worker 矩形阵列 additive + suppAt（cad.worker.ts:1877）──
function rectPattern({ cx, cy, cz, dx, dy, dz, suppress }) {
  const suppAt = (i, j, k) => !!suppress?.[(i * cy + j) * cz + k]
  const tr = (i, j, k) => [i * dx, j * dy, k * dz]
  const base = makeBaseBox(20, 20, 20)  // 8000 mm³ each, x∈[-10,10] y∈[-10,10] z∈[0,20]
  let acc = base
  for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) for (let k = 0; k < cz; k++) {
    if ((i === 0 && j === 0 && k === 0) || suppAt(i, j, k)) continue
    const [tx, ty, tz] = tr(i, j, k)
    acc = acc.fuse(base.clone().translate(tx, ty, tz))
  }
  return acc
}
// 3×1×1 网格 dx=50（唔重叠）：无抑制 = 3 份；抑制 idx 1（中间副本）= 2 份。
const full3 = rectPattern({ cx: 3, cy: 1, cz: 1, dx: 50, dy: 0, dz: 0 })
const supp1 = rectPattern({ cx: 3, cy: 1, cz: 1, dx: 50, dy: 0, dz: 0, suppress: [false, true, false] })
report('S3 矩形：3 份全出 → 体积 ≈ 24000', near(meshVol(full3), 24000, 5), { v: +meshVol(full3).toFixed(0) })
report('S3 矩形：抑制中间副本 → 体积 ≈ 16000（少一份）', near(meshVol(supp1), 16000, 5), { v: +meshVol(supp1).toFixed(0) })
// 抑制后中间位（x=50）应无实体：bbox 仍 [-10,110]（seed + 末副本），但体积证中间冇
const b = supp1.boundingBox.bounds
report('S3 矩形：bbox 跨 [−10,110]（首尾在，中间抑制）', near(b[0][0], -10) && near(b[1][0], 110), { xmin: b[0][0], xmax: b[1][0] })

// ── 复刻 cpAngles + 环形抑制过滤（cad.worker.ts:4080）──
function cpAngles(n, total, mode) {
  const out = []
  if (mode === 'sym') { const step = total / (n - 1); const half = Math.floor((n - 1) / 2); for (let k = 1; k <= half; k++) { out.push(step * k); out.push(-step * k) } if ((n - 1) % 2 === 1) out.push(step * (half + 1)) }
  else { const step = mode === 'full' ? 360 / n : (Math.abs(total) >= 359.9 ? total / n : total / (n - 1)); for (let i = 1; i < n; i++) out.push(step * i) }
  return out
}
// 6 份 full 360 → 副本角 [60,120,180,240,300]（seed=0°）。抑制实例 2 → 跳副本 ci=1（120°）。
const ang6 = cpAngles(6, 360, 'full')
const suppMask = [false, false, true]  // 索引 2 = 副本 ci=1（第二个副本）
const kept = ang6.filter((_, ci) => !suppMask[ci + 1])
report('S3 环形：6 份 → 5 个副本角 [60..300]', ang6.length === 5 && near(ang6[0], 60) && near(ang6[4], 300), { ang6 })
report('S3 环形：抑制实例 2 → 120° 副本被剔除（剩 4 个）', kept.length === 4 && !kept.includes(120), { kept })

// ── 抑制字串解析（复刻 store parseSuppressMask）──
function parseSuppressMask(raw, total) {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const idxs = raw.split(/[,，\s]+/).map((x) => Math.round(Number(x))).filter((n) => Number.isInteger(n) && n >= 0 && n < total)
  if (!idxs.length) return undefined
  const mask = new Array(total).fill(false); for (const i of idxs) mask[i] = true
  return mask.some(Boolean) ? mask : undefined
}
report('S3 解析：""→undefined（旧档逐字节）', parseSuppressMask('', 6) === undefined, {})
report('S3 解析："2,5"→mask[2]=mask[5]=true', (() => { const m = parseSuppressMask('2,5', 6); return m && m[2] && m[5] && !m[0] && !m[3] })(), { m: parseSuppressMask('2,5', 6) })
report('S3 解析：越界索引忽略（"2,99" @ total 6 → 只 mask[2]）', (() => { const m = parseSuppressMask('2,99', 6); return m && m[2] && m.filter(Boolean).length === 1 })(), {})

console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAIL'} — pass=${pass} fail=${fail}`)
process.exit(fail === 0 ? 0 : 1)
