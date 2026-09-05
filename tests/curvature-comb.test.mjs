import { principalCurvature } from '../src/cad/curvatureComb.ts';
let fail=0; const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}  ${m}`); if(!c)fail++;};
// 柱面 R=5, 高 24, 周向 48, 轴向 24 环 → 解析：κ1=1/R=0.2 周向, κ2=0 轴向, 主方向 e(κ2)=轴向 ±Z
const R=5, H=24, nT=48, nZ=24;
const V=[], T=[];
for(let iz=0; iz<=nZ; iz++) for(let it=0; it<nT; it++){ const th=2*Math.PI*it/nT; V.push(R*Math.cos(th), R*Math.sin(th), H*iz/nZ); }
const idx=(iz,it)=> iz*nT + (it%nT);
for(let iz=0; iz<nZ; iz++) for(let it=0; it<nT; it++){ const a=idx(iz,it),b=idx(iz,it+1),c=idx(iz+1,it+1),d=idx(iz+1,it); T.push(a,b,c, a,c,d); }
const pc = principalCurvature(V, T);
const nv=V.length/3;
// 抽中间环嘅内部顶点
let nChecked=0, k1ok=0, k2ok=0, axialOk=0;
for(let it=0; it<nT; it+=6){ const i=idx(12,it); if(pc.boundary[i]) continue; nChecked++;
  const k1=Math.abs(pc.k1[i]), k2=Math.abs(pc.k2[i]);
  if(Math.abs(k1-0.2)<0.04) k1ok++;            // 1/R=0.2 ±20%
  if(k2<0.05) k2ok++;                          // κ2≈0
  const e2z=Math.abs(pc.e2[i*3+2]);            // κ2 方向应轴向 → |e2·z|≈1
  if(e2z>0.85) axialOk++;
}
ok(nChecked>=6, `检查咗 ${nChecked} 个内部顶点`);
ok(k1ok>=nChecked*0.8, `κ1≈1/R=0.2 周向 (${k1ok}/${nChecked} 合格)`);
ok(k2ok>=nChecked*0.8, `κ2≈0 轴向 (${k2ok}/${nChecked} 合格)`);
ok(axialOk>=nChecked*0.8, `κ2 主方向≈轴向 ±Z (${axialOk}/${nChecked} |e2·z|>0.85)`);
// 边界标记：顶/底环顶点应 boundary=1
ok(pc.boundary[idx(0,0)]===1 && pc.boundary[idx(nZ,0)]===1, '顶/底环顶点标 boundary');
console.log(fail===0?'\n全部通过':`\n${fail} 项失败`);
process.exit(fail===0?0:1);
