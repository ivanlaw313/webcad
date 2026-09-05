// meshhull.test.mjs — S178 convexHull3D 验证（incremental 3D 凸包）
import { convexHull3D } from '../src/geom/meshHull.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// 体积（散度公式，同 io/meshBool.meshVolume）
const vol = (v, t) => { let s = 0; for (let i = 0; i < t.length; i += 3) { const a = t[i]*3, b = t[i+1]*3, c = t[i+2]*3; s += v[a]*(v[b+1]*v[c+2]-v[b+2]*v[c+1]) + v[a+1]*(v[b+2]*v[c]-v[b]*v[c+2]) + v[a+2]*(v[b]*v[c+1]-v[b+1]*v[c]); } return Math.abs(s/6); };

// T1 单位立方 8 角 → 凸包 = 该立方（8 顶点 / 12 三角 / 体积 1）
const cube = [0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1];
const r1 = convexHull3D(cube);
ok(r1.vertices.length/3 === 8, `立方 → 8 顶点 (实际 ${r1.vertices.length/3})`);
ok(r1.triangles.length/3 === 12, `立方 → 12 三角 (实际 ${r1.triangles.length/3})`);
ok(Math.abs(vol(r1.vertices, r1.triangles) - 1) < 1e-6, `立方体积 = 1 (实际 ${vol(r1.vertices, r1.triangles).toFixed(4)})`);
ok(r1.normals.length === r1.vertices.length, '法线数 == 顶点数');

// T2 内部点被排除：立方 8 角 + 中心点 [0.5,0.5,0.5] → 仍 8 顶点
const r2 = convexHull3D([...cube, 0.5,0.5,0.5]);
ok(r2.vertices.length/3 === 8, `8 角 + 内部点 → 仍 8 顶点（内部点排除）(实际 ${r2.vertices.length/3})`);
ok(Math.abs(vol(r2.vertices, r2.triangles) - 1) < 1e-6, '内部点不改体积');

// T3 凹陷被填平：立方 + 一个外凸尖点 → 体积增大（凸包 ⊇ 原）
const spike = [...cube, 0.5,0.5,2.0];   // 尖点喺立方上方
const r3 = convexHull3D(spike);
ok(vol(r3.vertices, r3.triangles) > 1.0 + 1e-6, `加外凸尖点 → 体积 >1 (实际 ${vol(r3.vertices, r3.triangles).toFixed(3)})`);
// 尖点必在凸包顶点上
const hasSpike = (() => { for (let i = 0; i < r3.vertices.length; i += 3) if (Math.abs(r3.vertices[i]-0.5)<1e-6 && Math.abs(r3.vertices[i+1]-0.5)<1e-6 && Math.abs(r3.vertices[i+2]-2.0)<1e-6) return true; return false; })();
ok(hasSpike, '外凸尖点喺凸包顶点上');

// T4 闭合性：每条边恰被 2 个三角共用（凸包系闭合 2-流形）
const edgeOK = (() => { const m = new Map(); for (let i = 0; i < r1.triangles.length; i += 3) { const f = [r1.triangles[i], r1.triangles[i+1], r1.triangles[i+2]]; for (const [a,b] of [[f[0],f[1]],[f[1],f[2]],[f[2],f[0]]]) { const k = a<b?`${a}_${b}`:`${b}_${a}`; m.set(k, (m.get(k)||0)+1); } } for (const c of m.values()) if (c !== 2) return false; return true; })();
ok(edgeOK, '立方凸包闭合（每边 2 面）');

// T5 退化：<4 点 → 空
ok(convexHull3D([0,0,0, 1,0,0, 0,1,0]).vertices.length === 0, '3 点 → 空');
// T6 退化：全共面（z=0 的 4 点）→ 空（无 3D 体积）
ok(convexHull3D([0,0,0, 1,0,0, 1,1,0, 0,1,0]).vertices.length === 0, '共面 4 点 → 空');
// T7 退化：全共线 → 空
ok(convexHull3D([0,0,0, 1,1,1, 2,2,2, 3,3,3]).vertices.length === 0, '共线 → 空');

// T8 四面体（最小非退化）→ 4 顶点 4 面
const r8 = convexHull3D([0,0,0, 1,0,0, 0,1,0, 0,0,1]);
ok(r8.vertices.length/3 === 4 && r8.triangles.length/3 === 4, `四面体 → 4 顶点 4 面 (实际 ${r8.vertices.length/3}/${r8.triangles.length/3})`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
