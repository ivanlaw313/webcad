// sectioncap.test.mjs — S186 cutFaceGeom 切面三角抽取（剖面盖上色用）
import { cutFaceGeom, cutFaceArea } from '../src/geom/sectionCap.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// 立方 [0,10]³，8 顶点 12 三角
const V = [0,0,0, 10,0,0, 10,10,0, 0,10,0, 0,0,10, 10,0,10, 10,10,10, 0,10,10];
const T = [0,1,2, 0,2,3,  4,6,5, 4,7,6,  0,4,5, 0,5,1,  2,6,7, 2,7,3,  0,3,7, 0,7,4,  1,5,6, 1,6,2];
const mesh = { vertices: V, triangles: T };

// x=0 切面 = 顶点 0,3,4,7（x=0）→ 三角 [0,3,7][0,7,4]，10×10 方 = 100
const gx = cutFaceGeom(mesh, 'X', 0);
ok(gx !== null, 'x=0 切面非空');
ok(gx && gx.triangles.length === 6, `x=0 切面 2 三角 (实际 ${gx ? gx.triangles.length/3 : 'n/a'})`);
ok(gx && Math.abs(cutFaceArea(gx, 'X') - 100) < 1e-6, `x=0 切面面积=100 (实际 ${gx ? cutFaceArea(gx, 'X').toFixed(1) : 'n/a'})`);
// 重索引：切面只 4 顶点
ok(gx && gx.vertices.length === 12, `x=0 切面重索引 4 顶点 (实际 ${gx ? gx.vertices.length/3 : 'n/a'})`);

// z=10 顶面 → 100
const gz = cutFaceGeom(mesh, 'Z', 10);
ok(gz && Math.abs(cutFaceArea(gz, 'Z') - 100) < 1e-6, `z=10 切面面积=100 (实际 ${gz ? cutFaceArea(gz, 'Z').toFixed(1) : 'n/a'})`);

// z=5 中间无共面三角 → null
ok(cutFaceGeom(mesh, 'Z', 5) === null, 'z=5 无共面三角 → null');
// 空网格 → null
ok(cutFaceGeom({ vertices: [], triangles: [] }, 'X', 0) === null, '空网格 → null');
// eps：x=0.04 喺 eps(0.05) 内仍捉到顶面三角
ok(cutFaceGeom(mesh, 'X', 0.04) !== null, 'x=0.04 喺 eps 内仍捉到');
ok(cutFaceGeom(mesh, 'X', 0.2) === null, 'x=0.2 超 eps → null');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
