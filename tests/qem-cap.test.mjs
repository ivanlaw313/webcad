import { qemSimplify } from '../src/io/meshRepair.ts';
let fail=0; const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}  ${m}`); if(!c)fail++;};
// 起伏网格 N=160 → 160*160*2 = 51200 三角（有曲率，QEM 唔会塌平）
const N=160, V=[], T=[];
for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){ V.push(i, j, 5*Math.sin(i*0.3)*Math.cos(j*0.3)); }
const idx=(i,j)=>j*(N+1)+i;
for(let j=0;j<N;j++)for(let i=0;i<N;i++){ T.push(idx(i,j),idx(i+1,j),idx(i+1,j+1), idx(i,j),idx(i+1,j+1),idx(i,j+1)); }
const nTri=T.length/3;
ok(nTri>30000, `输入 ${nTri} 三角 (>3万)`);
const ratio=Math.min(0.9, 25000/nTri);
const dec=qemSimplify(V, T, ratio);
const decTri=dec.triangles.length/3;
ok(decTri>0 && decTri<=30000, `QEM 简化到 ${decTri} 三角 (≤3万，解除缝合上限)`);
ok(decTri>5000, `保留合理细节 ${decTri} (>5k，非过度塌缩)`);
ok(dec.vertices.length>0 && dec.normals.length===dec.vertices.length, '有顶点+法向');
console.log(fail===0?'\n全部通过':`\n${fail} 项失败`);
process.exit(fail===0?0:1);
