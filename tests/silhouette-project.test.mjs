// silhouette-project.test.mjs — S189 实体特征边投影（projectFeatureEdges，computeRefGeo pass 3 嘅纯核心）
import { projectFeatureEdges } from '../src/geom/projectSilhouette.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// 立方 x,y∈[0,10] z∈[5,15]，投影到 XY 平面（沿 z）
const V = [0,0,5, 10,0,5, 10,10,5, 0,10,5,  0,0,15, 10,0,15, 10,10,15, 0,10,15];
const T = [0,1,2, 0,2,3,  4,6,5, 4,7,6,  0,4,5, 0,5,1,  2,6,7, 2,7,3,  0,3,7, 0,7,4,  1,5,6, 1,6,2];
const mesh = { vertices: V, triangles: T };

const segs = projectFeatureEdges(mesh, 'XY');
ok(segs.length === 4, `4 条轮廓边（顶底重合去重 + 竖边塌点滤走）(实际 ${segs.length})`);
// 角点范围 [s,t]=[x,-y]：x∈[0,10] → s∈[0,10]；y∈[0,10] → t∈[-10,0]
let smn=1e9,smx=-1e9,tmn=1e9,tmx=-1e9;
for (const [a,b] of segs) for (const p of [a,b]){ smn=Math.min(smn,p[0]); smx=Math.max(smx,p[0]); tmn=Math.min(tmn,p[1]); tmx=Math.max(tmx,p[1]); }
ok(Math.abs(smn-0)<1e-6 && Math.abs(smx-10)<1e-6, `s 范围 [0,10] (实际 [${smn.toFixed(1)},${smx.toFixed(1)}])`);
ok(Math.abs(tmn+10)<1e-6 && Math.abs(tmx-0)<1e-6, `t 范围 [-10,0] (实际 [${tmn.toFixed(1)},${tmx.toFixed(1)}])`);
let per=0; for (const [a,b] of segs) per+=Math.hypot(b[0]-a[0],b[1]-a[1]);
ok(Math.abs(per-40)<1e-6, `轮廓周长=40（4×10 方框）(实际 ${per.toFixed(1)})`);

// 投影到 XZ 平面（沿 y）：x∈[0,10] z∈[5,15] → [s,t]=[x,z] 10×10 方框，周长 40
const segXZ = projectFeatureEdges(mesh, 'XZ');
let perXZ=0; for (const [a,b] of segXZ) perXZ+=Math.hypot(b[0]-a[0],b[1]-a[1]);
ok(segXZ.length === 4 && Math.abs(perXZ-40)<1e-6, `XZ 投影 4 边周长 40 (实际 ${segXZ.length} 边 ${perXZ.toFixed(1)})`);

// 退化：空网格 → []
ok(projectFeatureEdges({ vertices: [], triangles: [] }, 'XY').length === 0, '空网格 → []');

// 阈值：sharpDot=2（dot<2 永真 → 连共面面内对角线都算特征边）→ 更多段（证 sharpDot 生效）
const segLoose = projectFeatureEdges(mesh, 'XY', 2);
ok(segLoose.length > 4, `松阈值 sharpDot=2 收更多边（证阈值生效）(实际 ${segLoose.length} > 4)`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
