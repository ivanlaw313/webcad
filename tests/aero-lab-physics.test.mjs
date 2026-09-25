// Aero Design Lab — physics cores validated against textbook references.
// Run: node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/aero-lab-physics.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { nacaCoords, panelSolve, panelLiftCurve, thinAirfoilAlpha0, makeNacaPolar, polarAt, parseNaca4 } from '../src/aero/airfoil.ts'
import { analyzeWing, helmbold } from '../src/aero/wing.ts'
import { analyzeProp, constantPitchProp } from '../src/aero/prop.ts'
import { analyzeShell } from '../src/aero/shell.ts'

const deg = Math.PI / 180
const within = (v, ref, tol, msg) => assert.ok(Math.abs(v - ref) <= tol * Math.abs(ref), `${msg}: ${v.toFixed(4)} vs ${ref.toFixed(4)} (tol ${(tol * 100).toFixed(1)}%)`)

test('NACA 4-digit generator: closed TE, correct max thickness, clockwise ordering', () => {
  assert.deepEqual(parseNaca4('2412'), { m: 0.02, p: 0.4, t: 0.12 })
  const c = nacaCoords({ m: 0, p: 0, t: 0.12 }, 80)
  assert.deepEqual(c[0], c[c.length - 1], 'closed trailing edge')
  let tmax = 0
  const half = (c.length - 1) / 2
  for (let i = 0; i < half; i++) tmax = Math.max(tmax, c[c.length - 1 - i][1] - c[i][1])
  within(tmax, 0.12, 0.02, 'max thickness')
  assert.ok(c[5][1] < 0 && c[c.length - 6][1] > 0, 'lower surface first, then upper')
})

test('panel method: NACA 0012 lift slope vs thin-airfoil 2π and thickness-corrected theory', () => {
  const lc = panelLiftCurve({ m: 0, p: 0, t: 0.12 }, 60)
  // inviscid panel slope includes the thickness effect: 2π(1+0.77 t/c) ≈ 6.87 /rad
  within(lc.cla, 2 * Math.PI * (1 + 0.77 * 0.12), 0.03, 'inviscid Clα vs 2π(1+0.77t)')
  assert.ok(Math.abs(lc.alpha0) < 1e-3, 'symmetric section has α0 = 0')
  // engineering polar (viscous-corrected) vs thin-airfoil 2π within 10%
  const pol = makeNacaPolar({ m: 0, p: 0, t: 0.12 })
  within(pol.cla, 2 * Math.PI, 0.10, 'viscous Clα vs 2π')
  const cl0 = panelSolve(nacaCoords({ m: 0, p: 0, t: 0.12 }, 60), 0).cl
  assert.ok(Math.abs(cl0) < 1e-6, 'Cl(0) = 0 for 0012')
})

test('panel method: cambered NACA 2412 zero-lift angle ≈ thin-airfoil −2.08°', () => {
  const a = { m: 0.02, p: 0.4, t: 0.12 }
  const th = thinAirfoilAlpha0(a) / deg
  within(th, -2.077, 0.01, 'thin-airfoil α0')
  const lc = panelLiftCurve(a, 60)
  assert.ok(Math.abs(lc.alpha0 / deg - th) < 0.3, `panel α0 ${(lc.alpha0 / deg).toFixed(2)}° vs ${th.toFixed(2)}°`)
})

test('polar: drag bucket, Re dependence and stall', () => {
  const p = makeNacaPolar({ m: 0.02, p: 0.4, t: 0.12 })
  const hi = polarAt(p, 2 * deg, 3e6), lo = polarAt(p, 2 * deg, 6e4)
  assert.ok(hi.cd > 0.004 && hi.cd < 0.012, `cd @Re3e6 ${hi.cd}`)
  assert.ok(lo.cd > hi.cd * 1.8, 'low Re drag much higher')
  let clmax = 0, aAt = 0
  for (let a = 0; a <= 25; a += 0.25) { const r = polarAt(p, a * deg, 1e6); if (r.cl > clmax) { clmax = r.cl; aAt = a } }
  assert.ok(clmax > 1.2 && clmax < 1.7, `Clmax ${clmax}`)
  assert.ok(aAt > 8 && aAt < 16, `stall angle ${aAt}`)
  assert.ok(polarAt(p, 25 * deg, 1e6).stalled && polarAt(p, 25 * deg, 1e6).cd > 0.15, 'post-stall drag rise')
})

const sym = { m: 0, p: 0, t: 0.12 }
const clAlpha = (g) => {
  const r0 = analyzeWing(g, { V: 30, alphaDeg: 0, nSemi: 20 }), r1 = analyzeWing(g, { V: 30, alphaDeg: 2, nSemi: 20 })
  return { cla: (r1.CL - r0.CL) / (2 * deg), r: r1 }
}

test('VLM: elliptic wing AR 8 → e ≈ 1 and CLα within 5% of Helmbold', () => {
  const { cla, r } = clAlpha({ span: 8, rootChord: 4 / Math.PI, taper: 1, sweepLE: 0, dihedral: 0, twistTip: 0, planform: 'elliptic', airfoil: sym })
  within(r.AR, 8, 0.01, 'aspect ratio')
  assert.ok(r.e > 0.98 && r.e < 1.01, `elliptic e = ${r.e}`)
  within(cla, helmbold(r.AR), 0.05, 'elliptic CLα vs Helmbold')
  // elliptic loading: cl constant along span (within 5% away from the extreme tip strip)
  const mid = r.span.filter((s) => Math.abs(s.y) < 3.2).map((s) => s.cl)
  assert.ok(Math.max(...mid) / Math.min(...mid) < 1.05, 'uniform cl along an elliptic span')
})

test('VLM: rectangular wing AR 8 → e in 0.90–0.98, CLα within 10% of Helmbold', () => {
  const { cla, r } = clAlpha({ span: 8, rootChord: 1, taper: 1, sweepLE: 0, dihedral: 0, twistTip: 0, airfoil: sym })
  assert.ok(r.e >= 0.9 && r.e <= 0.98, `rectangular e = ${r.e}`)
  within(cla, helmbold(8), 0.10, 'rectangular CLα vs Helmbold')
  assert.ok(cla < helmbold(8), 'rectangular slope below elliptic/Helmbold (as in Weissinger/wind-tunnel data)')
})

test('VLM: taper ≈ 0.4 is near-elliptic; sweep lowers CLα; trim hits target lift', () => {
  const base = { span: 2, rootChord: 0.3, taper: 1, sweepLE: 0, dihedral: 0, twistTip: 0, airfoil: sym }
  const eRect = clAlpha({ ...base, rootChord: 0.25 }).r.e
  const eTaper = clAlpha({ ...base, rootChord: 0.357, taper: 0.4 }).r.e
  assert.ok(eTaper > eRect && eTaper > 0.98, `taper 0.4 e ${eTaper} > rect ${eRect}`)
  const s0 = clAlpha({ ...base, sweepLE: 0 }).cla, s35 = clAlpha({ ...base, sweepLE: 35 }).cla
  assert.ok(s35 < s0 * 0.92, `sweep reduces CLα (${s35.toFixed(2)} < ${s0.toFixed(2)})`)
  const t = analyzeWing({ ...base, airfoil: { m: 0.02, p: 0.4, t: 0.1 } }, { V: 12, targetLiftN: 20 })
  within(t.lift, 20, 0.001, 'trimmed lift')
  assert.ok(t.LD > 5 && t.LD < 40, `L/D ${t.LD}`)
})

test('BEMT: APC-like 10×4.7 at 6000 rpm — static thrust a few N, CT falls with J, η < 1 peaks mid-J', () => {
  const g = constantPitchProp(10, 4.7, 2)
  const s = analyzeProp(g, { rpm: 6000, V: 0 })
  assert.ok(s.thrust > 3 && s.thrust < 9, `static thrust ${s.thrust.toFixed(2)} N (UIUC APC 10x4.7SF ≈ 5–6 N)`)
  assert.ok(s.CT > 0.07 && s.CT < 0.14, `CT0 ${s.CT}`)
  assert.ok(s.FM > 0.4 && s.FM < 0.85, `figure of merit ${s.FM}`)
  const Js = [0.1, 0.2, 0.3, 0.4, 0.5, 0.55, 0.6]
  const runs = Js.map((J) => analyzeProp(g, { rpm: 6000, V: J * 100 * 0.254 }))
  for (let i = 1; i < runs.length; i++) assert.ok(runs[i].CT < runs[i - 1].CT, `CT decreasing at J=${Js[i]}`)
  const etas = runs.map((r) => r.eta)
  for (const e of etas) assert.ok(e < 1 && e >= 0, 'η in [0,1)')
  const iMax = etas.indexOf(Math.max(...etas))
  assert.ok(iMax > 0 && iMax < etas.length - 1, `η peaks inside the J range (peak at J=${Js[iMax]})`)
  assert.ok(Math.max(...etas) > 0.55 && Math.max(...etas) < 0.85, `peak η ${Math.max(...etas)}`)
  within(runs[2].J, 0.3, 1e-9, 'advance ratio J = V/(nD)')
})

test('BEMT: more pitch → more static thrust & power; water ~ρ ratio more thrust at same rpm', () => {
  const lo = analyzeProp(constantPitchProp(10, 3.8), { rpm: 5000, V: 0 })
  const hi = analyzeProp(constantPitchProp(10, 6), { rpm: 5000, V: 0 })
  assert.ok(hi.thrust > lo.thrust && hi.power > lo.power)
  const air = analyzeProp(constantPitchProp(4, 4), { rpm: 800, V: 0 })
  const wat = analyzeProp(constantPitchProp(4, 4), { rpm: 800, V: 0, fluid: 'water' })
  const ratio = wat.thrust / air.thrust
  assert.ok(ratio > 500 && ratio < 1300, `water/air thrust ratio ${ratio.toFixed(0)} (ρ ratio 829, Re effects)`)
})

test('shell: streamlined body drag, fineness optimum and boat-tail separation', () => {
  const V = 2, fluid = 'water'
  const vol = (g) => analyzeShell(g, { V, fluid }).volume
  // same volume, varying fineness ratio → drag per volume minimum between 2.5 and 8
  const target = 0.0015
  const at = (FR) => {
    let d = 0.1
    for (let i = 0; i < 40; i++) { const g = { length: FR * d, diameter: d, xMax: 0.4, noseExp: 2, tailExp: 2, baseFrac: 0 }; d *= Math.cbrt(target / vol(g)) }
    return analyzeShell({ length: FR * d, diameter: d, xMax: 0.4, noseExp: 2, tailExp: 2, baseFrac: 0 }, { V, fluid })
  }
  const FRs = [1.5, 2, 3, 4, 5, 6, 8, 12]
  const drags = FRs.map((f) => at(f).drag)
  const best = FRs[drags.indexOf(Math.min(...drags))]
  assert.ok(best >= 2.5 && best <= 8, `min-drag fineness ${best}`)
  const r4 = at(4)
  assert.ok(r4.CD > 0.03 && r4.CD < 0.15, `streamlined L/D=4 frontal CD ${r4.CD.toFixed(3)} (Hoerner ≈ 0.05–0.1)`)
  const smooth = analyzeShell({ length: 0.4, diameter: 0.1, xMax: 0.4, noseExp: 2, tailExp: 2, baseFrac: 0.1 }, { V, fluid })
  const blunt = analyzeShell({ length: 0.4, diameter: 0.1, xMax: 0.85, noseExp: 2, tailExp: 1, baseFrac: 0.1 }, { V, fluid })
  assert.ok(blunt.CD > smooth.CD * 1.3, 'steep boat-tail / stubby tail adds separation drag')
  within(smooth.frontal, Math.PI * 0.05 ** 2, 1e-9, 'frontal area')
})
