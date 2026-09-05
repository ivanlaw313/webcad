// subdivloop.test.mjs — S180 insertEdgeLoop 验证（Form 插入边线环）
import { makeBoxCage, insertEdgeLoop, ccSubdivide, quadsToTris } from '../src/cad/subdiv.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// 闭合 2-流形检查（每无向边恰 2 quad）
const manifold = (mesh) => { const nV = mesh.verts.length; const cnt = new Map(); for (const q of mesh.quads) for (let s = 0; s < 4; s++) { const a = q[s], b = q[(s+1)&3]; if (a===b) return false; const lo = Math.min(a,b), hi = Math.max(a,b); const k = lo*nV+hi; cnt.set(k,(cnt.get(k)||0)+1); } for (const c of cnt.values()) if (c !== 2) return false; return true; };
// 有符号体积（quad 扇三角 + 散度）
const vol = (mesh) => { const v = mesh.verts; let s = 0; for (const q of mesh.quads) for (const [a,b,c] of [[q[0],q[1],q[2]],[q[0],q[2],q[3]]]) { const A=v[a],B=v[b],C=v[c]; s += A[0]*(B[1]*C[2]-B[2]*C[1]) + A[1]*(B[2]*C[0]-B[0]*C[2]) + A[2]*(B[0]*C[1]-B[1]*C[0]); } return s/6; };

// 单位盒笼：2×2×2，1 段 → 6 quad / 8 顶点 / 体积 8
const box = makeBoxCage(2, 2, 2, 1, 1, 1);
ok(box.quads.length === 6 && box.verts.length === 8, `盒笼 6 quad / 8 顶点 (实际 ${box.quads.length}/${box.verts.length})`);
ok(Math.abs(vol(box) - 8) < 1e-9, `盒体积 8 (实际 ${vol(box).toFixed(4)})`);
ok(manifold(box), '盒笼闭合流形');

// 插入一圈边线环（face0 slot0）→ 环绕 4 面、各一分为二
const r = insertEdgeLoop(box, 0, 0);
ok(r !== null, '插环成功（非 null）');
ok(r.quads.length === 10, `插环后 10 quad（6−4环+8）(实际 ${r?.quads.length})`);
ok(r.verts.length === 12, `插环后 12 顶点（8+4 中点）(实际 ${r?.verts.length})`);
ok(manifold(r), '插环后仍闭合 2-流形（每边恰 2 面）');
ok(Math.abs(vol(r) - 8) < 1e-9, `插环后体积不变 = 8（中点喺边上）(实际 ${vol(r).toFixed(4)})`);

// 中点全部落喺原有边上（z=0/2 或 x=±1 或 y=±1 嘅边中点；至少都喺盒面上）
const onBox = r.verts.every((p) => Math.abs(p[0]) <= 1+1e-9 && Math.abs(p[1]) <= 1+1e-9 && p[2] >= -1e-9 && p[2] <= 2+1e-9);
ok(onBox, '所有顶点喺盒包围盒内（中点落边上，无飞点）');

// ccSubdivide(插环结果) 唔 throw（结果系合法 CC 输入）
let ccOK = true; try { ccSubdivide(r, 1); } catch { ccOK = false; }
ok(ccOK, '插环结果可再 Catmull-Clark 细分（合法闭合流形）');
// quadsToTris 唔 throw + 出三角
let tri = null; try { tri = quadsToTris(r); } catch {}
ok(tri && tri.triangles.length === r.quads.length * 6, `插环结果可三角化 (${tri?.triangles.length/3} 三角)`);

// 守卫：faceIdx 越界 → null
ok(insertEdgeLoop(box, 99, 0) === null, 'faceIdx 越界 → null');

// 第二次插环（喺已插环结果上不同方向）→ 仍流形、体积不变
const r2 = insertEdgeLoop(r, 0, 1);
ok(r2 !== null && manifold(r2) && Math.abs(vol(r2) - 8) < 1e-9, `二次插环仍流形+体积不变 (实际 ${r2 ? vol(r2).toFixed(3) : 'null'})`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
