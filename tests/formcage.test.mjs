// formcage.test.mjs — S181 makeCylinderCage / makePlaneCage 验证（Form primitive cages）
import { makeCylinderCage, makePlaneCage, ccSubdivide } from '../src/cad/subdiv.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };
const manifold = (m) => { const nV = m.verts.length; const cnt = new Map(); for (const q of m.quads) for (let s = 0; s < 4; s++) { const a = q[s], b = q[(s+1)&3]; if (a===b) return false; const lo = Math.min(a,b), hi = Math.max(a,b); cnt.set(lo*nV+hi, (cnt.get(lo*nV+hi)||0)+1); } for (const c of cnt.values()) if (c !== 2) return false; return true; };
const vol = (m) => { const v = m.verts; let s = 0; for (const q of m.quads) for (const [a,b,c] of [[q[0],q[1],q[2]],[q[0],q[2],q[3]]]) { const A=v[a],B=v[b],C=v[c]; s += A[0]*(B[1]*C[2]-B[2]*C[1]) + A[1]*(B[2]*C[0]-B[0]*C[2]) + A[2]*(B[0]*C[1]-B[1]*C[0]); } return s/6; };
const allQuad = (m) => m.quads.every(q => q.length === 4 && new Set(q).size === 4);
const inBox = (m, R, H) => m.verts.every(([x,y,z]) => Math.hypot(x,y) <= R + 1e-6 && z >= -1e-6 && z <= H + 1e-6);
const PI = Math.PI;

// ---- 圆柱笼 R=10 H=20 ----
const cyl = makeCylinderCage(10, 20, 2, 1);
ok(manifold(cyl), '圆柱笼闭合 2-流形（每边恰 2 quad）');
ok(allQuad(cyl), '圆柱笼全 quad（无三角/退化）');
ok(vol(cyl) > 0, `圆柱笼 signed-vol > 0 (实际 ${vol(cyl).toFixed(0)})`);
ok(inBox(cyl, 10, 20), '圆柱笼所有顶点喺 R≤10 圆柱包围内（squircle 映射无飞点）');
let ccOK = true; try { ccSubdivide(cyl, 1); ccSubdivide(cyl, 2); ccSubdivide(cyl, 3); } catch { ccOK = false; }
ok(ccOK, '圆柱笼可 Catmull-Clark 细分 1/2/3 级（合法闭合流形）');
const cylSub = ccSubdivide(cyl, 2);
const cylSubVol = vol(cylSub.mesh ? cylSub.mesh : cylSub);
const cylExpect = PI * 100 * 20;   // ≈6283
// CC 系【逼近型】会向控制壳收缩，粗笼(nSeg=2，八边形盖)收得多 → 体积 < 笼；只验仍正、仍闭合、且【更高分辨率更逼近】（收敛单调）。
ok(cylSubVol > 0 && cylSubVol < vol(cyl), `圆柱粗笼细分体积正且 < 笼（CC 逼近型收缩，正常）(实际 ${cylSubVol.toFixed(0)})`);
ok(manifold(cylSub.mesh ? cylSub.mesh : cylSub), '圆柱细分后仍闭合流形');

// 更高分辨率 → 收得少、逼近 πR²H（默认笼 nSeg=4 烘焙近标称半径）
const cyl4 = makeCylinderCage(10, 20, 4, 2);
const cyl4Sub = ccSubdivide(cyl4, 2); const cyl4Vol = vol(cyl4Sub.mesh ? cyl4Sub.mesh : cyl4Sub);
ok(cyl4Vol > cylSubVol, `更高分辨率圆柱收缩更少/更逼近 (n4=${cyl4Vol.toFixed(0)} > n2=${cylSubVol.toFixed(0)})`);
ok(cyl4Vol > cylExpect * 0.82 && cyl4Vol < cylExpect * 1.05, `nSeg=4 圆柱细分逼近 πR²H≈${cylExpect.toFixed(0)} 内 ±18% (实际 ${cyl4Vol.toFixed(0)})`);

// ---- 平面/薄片笼 40×30×1 ----
const pl = makePlaneCage(40, 30, 2, 2, 1);
ok(manifold(pl) && allQuad(pl), '平面笼闭合流形 + 全 quad');
ok(Math.abs(vol(pl) - 40 * 30 * 1) < 1e-6, `平面笼体积 = 40×30×1 = 1200 (实际 ${vol(pl).toFixed(1)})`);
let plOK = true; try { ccSubdivide(pl, 2); } catch { plOK = false; }
ok(plOK, '平面笼可细分');

// 退化守卫
let threw = false; try { makeCylinderCage(-1, 20, 2, 1); } catch { threw = true; }
ok(threw, '圆柱笼 R≤0 抛错');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
