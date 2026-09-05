// spheretoruscage.test.mjs — S182 makeSphereCage / makeTorusCage 验证（Form sphere/torus primitives）
import { makeSphereCage, makeTorusCage, ccSubdivide } from '../src/cad/subdiv.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };
const PI = Math.PI;
const manifold = (m) => { const nV = m.verts.length; const cnt = new Map(); for (const q of m.quads) for (let s = 0; s < 4; s++) { const a = q[s], b = q[(s+1)&3]; if (a===b) return false; const lo = Math.min(a,b), hi = Math.max(a,b); cnt.set(lo*nV+hi, (cnt.get(lo*nV+hi)||0)+1); } for (const c of cnt.values()) if (c !== 2) return false; return true; };
const vol = (m) => { const v = m.verts; let s = 0; for (const q of m.quads) for (const [a,b,c] of [[q[0],q[1],q[2]],[q[0],q[2],q[3]]]) { const A=v[a],B=v[b],C=v[c]; s += A[0]*(B[1]*C[2]-B[2]*C[1]) + A[1]*(B[2]*C[0]-B[0]*C[2]) + A[2]*(B[0]*C[1]-B[1]*C[0]); } return s/6; };
const allQuad = (m) => m.quads.every(q => q.length === 4 && new Set(q).size === 4);
const euler = (m) => { const nV = m.verts.length; const E = new Set(); for (const q of m.quads) for (let s = 0; s < 4; s++) { const a = q[s], b = q[(s+1)&3]; E.add(Math.min(a,b)*nV+Math.max(a,b)); } return nV - E.size + m.quads.length; };
const getMesh = (r) => (r && r.mesh ? r.mesh : r);

// ---- 球笼 R=10 ----
const sph = makeSphereCage(10, 3);
const C = [0, 0, 10];  // 居中（底落 z=0 → 中心 z=R）
ok(manifold(sph), '球笼闭合 2-流形（每边恰 2 quad）');
ok(allQuad(sph), '球笼全 quad');
ok(vol(sph) > 0, `球笼 signed-vol > 0 (实际 ${vol(sph).toFixed(0)})`);
ok(euler(sph) === 2, `球笼 Euler V−E+F = 2 (genus 0, 实际 ${euler(sph)})`);
const radii = sph.verts.map(([x,y,z]) => Math.hypot(x - C[0], y - C[1], z - C[2]));
const rmin = Math.min(...radii), rmax = Math.max(...radii);
ok(rmin > 10 * 0.8 && rmax < 10 * 1.05, `球笼所有顶点半径 ≈ R=10（cube→sphere，实际 [${rmin.toFixed(2)}, ${rmax.toFixed(2)}]）`);
ok(sph.verts.every(([,,z]) => z >= -1e-6), '球底落 z≥0（rest on plane）');
let sphCC = true; try { ccSubdivide(sph, 1); ccSubdivide(sph, 2); ccSubdivide(sph, 3); } catch { sphCC = false; }
ok(sphCC, '球笼可 Catmull-Clark 细分 1/2/3 级');
const sphSubVol = vol(getMesh(ccSubdivide(sph, 2)));
const sphExpect = (4/3) * PI * 1000;  // ≈4189
ok(sphSubVol > 0 && sphSubVol < sphExpect * 1.02 && sphSubVol > sphExpect * 0.5, `球细分体积逼近 (4/3)πR³≈${sphExpect.toFixed(0)}（CC 向内收，实际 ${sphSubVol.toFixed(0)}）`);
ok(manifold(getMesh(ccSubdivide(sph, 2))), '球细分后仍闭合流形');

// ---- 环面笼 R=20 r=6 ----
const tor = makeTorusCage(20, 6, 16, 10);
ok(manifold(tor), '环面笼闭合 2-流形（每边恰 2 quad）');
ok(allQuad(tor), '环面笼全 quad');
ok(vol(tor) > 0, `环面笼 signed-vol > 0（绕向外法向，实际 ${vol(tor).toFixed(0)}）`);
ok(euler(tor) === 0, `环面笼 Euler V−E+F = 0 (genus 1, 实际 ${euler(tor)})`);
const torExpect = 2 * PI * PI * 20 * 6 * 6;  // 2π²Rr² ≈ 14212
ok(vol(tor) > torExpect * 0.6 && vol(tor) < torExpect * 1.05, `环面笼体积逼近 2π²Rr²≈${torExpect.toFixed(0)}（多边形近似 undershoot，实际 ${vol(tor).toFixed(0)}）`);
ok(tor.verts.every(([,,z]) => z >= -1e-6), '环面管底落 z≥0');
let torCC = true; try { ccSubdivide(tor, 1); ccSubdivide(tor, 2); } catch { torCC = false; }
ok(torCC, '环面笼可 Catmull-Clark 细分 1/2 级（genus-1 流形）');
ok(manifold(getMesh(ccSubdivide(tor, 2))), '环面细分后仍闭合流形');
ok(euler(getMesh(ccSubdivide(tor, 1))) === 0, '环面细分后仍 genus 1（Euler=0）');

// ---- 退化守卫 ----
let s1 = false; try { makeSphereCage(-1, 3); } catch { s1 = true; }
ok(s1, '球笼 R≤0 抛错');
let t1 = false; try { makeTorusCage(5, 8, 12, 8); } catch { t1 = true; }
ok(t1, '环面笼 R≤r 抛错（自交守卫）');
let t2 = false; try { makeTorusCage(20, 6, 2, 8); } catch { t2 = true; }
ok(t2, '环面笼分段 <3 抛错');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
