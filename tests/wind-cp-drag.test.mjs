// wind-fix 回归：CPU LBM 风洞（src/analysis/windtunnel.ts）headless 跑真 solver，钉死
//   ① 表面 Cp 归一化：低马赫滞点 Cp_max ≈ 1（旧版 p∞ 假设 = 名义 ρ0=1 + 上游太短 → 2.3–2.8）
//   ② 球底压 Cp < 0；球 Cd < 盒 Cd（趋势）
//   ③ 显示阻力 dragN == ½ρV²·A·Cd_corrected（旧版用原始 Cd，同 headline 对唔上）
//   ④ 阻力 ∝ V²；水/气阻力比 ≈ ρ 比（≈829）
// 跑法：node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/wind-cp-drag.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { runWindTunnel } from '../src/analysis/windtunnel.ts'

function boxMesh(ax, ay, az) {
  const v = [-ax, -ay, -az, ax, -ay, -az, ax, ay, -az, -ax, ay, -az, -ax, -ay, az, ax, -ay, az, ax, ay, az, -ax, ay, az]
  const t = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 2, 3, 7, 2, 7, 6, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3]
  return { vertices: v, triangles: t }
}
function sphereMesh(R, st = 24, sl = 32) {
  const v = [], t = []
  for (let i = 0; i <= st; i++) {
    const p = Math.PI * i / st
    for (let j = 0; j <= sl; j++) { const th = 2 * Math.PI * j / sl; v.push(R * Math.cos(p), R * Math.sin(p) * Math.cos(th), R * Math.sin(p) * Math.sin(th)) }
  }
  const row = sl + 1
  for (let i = 0; i < st; i++) for (let j = 0; j < sl; j++) { const a = i * row + j, b = a + 1, c = a + row, d = c + 1; t.push(a, c, b, b, c, d) }
  return { vertices: v, triangles: t }
}
const run = (mesh, o = {}) => runWindTunnel({ ...mesh, speed: o.speed ?? 20, fluid: o.fluid ?? 'air', axis: 0, sign: 1, resolution: o.res ?? 12, maxRes: o.res ?? 12 })
const dragOf = (r, cd) => cd * 0.5 * r.rho * r.speed * r.speed * r.frontalAreaMM2 * 1e-6
const meanCp = (r, pred) => { let s = 0, c = 0; for (let i = 0; i < r.nSurf; i++) if (pred(r.centers[3 * i])) { s += r.cp[i]; c++ } return s / c }

const sphere = run(sphereMesh(20), { res: 12 })
const box = run(boxMesh(40, 30, 20), { res: 16 })
console.log(`[wind] sphere: Cp ${sphere.cpMin.toFixed(3)}..${sphere.cpMax.toFixed(3)} Cd raw ${sphere.cd.toFixed(3)} corr ${sphere.cdCorr.toFixed(3)} base Cp ${meanCp(sphere, (x) => x > 15).toFixed(3)} steps ${sphere.steps}`)
console.log(`[wind] box 80x60x40: Cp ${box.cpMin.toFixed(3)}..${box.cpMax.toFixed(3)} Cd raw ${box.cd.toFixed(3)} corr ${box.cdCorr.toFixed(3)} drag ${box.dragN.toFixed(4)} N (raw ${box.dragNRaw.toFixed(4)} N)`)

test('sphere stagnation Cp_max ≈ 1 (low Mach) and base Cp negative', () => {
  assert.ok(sphere.cpMax >= 0.85 && sphere.cpMax <= 1.15, `sphere Cp_max=${sphere.cpMax}`)
  assert.ok(meanCp(sphere, (x) => x < -15) > 0.3, 'windward face mean Cp should be clearly positive')
  assert.ok(meanCp(sphere, (x) => x > 15) < 0, `sphere base Cp=${meanCp(sphere, (x) => x > 15)}`)
})

test('box Cp_max ≈ 1 (was 2.5–2.8 before the p∞ fix)', () => {
  assert.ok(box.cpMax >= 0.85 && box.cpMax <= 1.15, `box Cp_max=${box.cpMax}`)
  assert.ok(meanCp(box, (x) => x > 35) < 0, 'box base Cp must be negative')
})

test('Cd trend: sphere < box; both in trend bands', () => {
  assert.ok(sphere.cdCorr < box.cdCorr && sphere.cd < box.cd)
  // 趋势带：低分辨率体素球 + 12% 堵塞 + LES 有效 Re 偏低 → ~0.7–0.85（出口防倒灌后；旧版 ~0.47 系出口倒灌射流压低底压嘅假象）
  assert.ok(sphere.cd > 0.3 && sphere.cd < 0.95, `sphere Cd=${sphere.cd}`)
  assert.ok(box.cd > 0.8 && box.cd < 2.1, `box Cd=${box.cd}`)
})

test('displayed drag == ½ρV²·A·Cd_corrected; raw drag kept separately', () => {
  for (const r of [sphere, box]) {
    assert.ok(r.cdCorr < r.cd)
    assert.ok(Math.abs(r.dragN - dragOf(r, r.cdCorr)) <= 1e-9 * dragOf(r, r.cdCorr), `dragN=${r.dragN} vs ${dragOf(r, r.cdCorr)}`)
    assert.ok(Math.abs(r.dragNRaw - dragOf(r, r.cd)) <= 1e-9 * dragOf(r, r.cd))
  }
})

test('drag ∝ V² and water/air drag ratio ≈ ρ ratio', () => {
  const m = boxMesh(40, 30, 20)
  const a20 = run(m, { speed: 20 }), a40 = run(m, { speed: 40 }), w20 = run(m, { speed: 20, fluid: 'water' })
  const rV = a40.dragN / a20.dragN, rW = w20.dragN / a20.dragN
  console.log(`[wind] drag(40)/drag(20)=${rV.toFixed(3)} (ideal 4) water/air=${rW.toFixed(1)} (ρ ratio ${(998 / 1.204).toFixed(1)})`)
  assert.ok(Math.abs(rV / 4 - 1) < 0.05, `V² scaling ${rV}`)
  assert.ok(Math.abs(rW / (998 / 1.204) - 1) < 0.1, `water/air ${rW}`)
})
