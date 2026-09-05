// thermal-stress-bulk-probe.mjs — ADDITIVE：区分「体内单轴应力」vs「夹持角奇点尖峰」
import { _internals } from '../src/analysis/voxelfea.ts';
const { runVoxelThermalStress } = _internals;
function boxMesh(sx,sy,sz){const v=[];for(let b=0;b<8;b++)v.push((b&1)?sx:0,(b&2)?sy:0,(b&4)?sz:0);
  const t=[0,1,3,0,3,2,4,5,7,4,7,6,0,4,5,0,5,1,2,3,7,2,7,6,0,2,6,0,6,4,1,5,7,1,7,3];return{vertices:v,triangles:t};}
const L=100,W=20,Hh=20,E=200000,nu=0.3,cte=12,k=50,DT=50,SIG=E*(cte*1e-6)*DT;
const m=boxMesh(L,W,Hh);
console.log('SIGanalytic='+SIG.toFixed(2)+' MPa（单轴 E·α·ΔT）');
console.log('res | vmMax | vmMedian | vm@midbody | %inBody<130 | maxDistFromClamp');
for(const res of [16,24,32,40]){
  const rs=runVoxelThermalStress({vertices:m.vertices,triangles:m.triangles,
    fixed:{point:[0,0,0],normal:[1,0,0]},fixed2:{point:[L,0,0],normal:[1,0,0]},
    hot:{point:[0,0,0],normal:[1,0,0]},cold:{point:[L,0,0],normal:[1,0,0]},
    Thot:20+DT,Tcold:20+DT,Tref:20,E,nu,cte,k,resolution:res});
  const vals=Array.from(rs.vm).sort((a,b)=>a-b);
  const median=vals[Math.floor(vals.length/2)];
  // mid-body: elements with 40<xc<60 AND away from lateral surfaces (5<yc<15,5<zc<15)
  let bodySum=0,bodyN=0,worstBody=0;
  let inBand=0,total=0;
  for(let i=0;i<rs.nVox;i++){
    const xc=rs.centers[i*3],yc=rs.centers[i*3+1],zc=rs.centers[i*3+2];
    total++;
    if(rs.vm[i]<130)inBand++;
    if(xc>40&&xc<60&&yc>5&&yc<15&&zc>5&&zc<15){bodySum+=rs.vm[i];bodyN++;worstBody=Math.max(worstBody,rs.vm[i]);}
  }
  const midBody=bodyN?bodySum/bodyN:NaN;
  // where is vmMax located relative to clamped ends (x=0 or x=L)?
  const xMax=rs.vmMaxAt[0];
  const distClamp=Math.min(xMax,L-xMax);
  console.log(`${String(res).padStart(3)} | ${rs.vmMax.toFixed(1).padStart(7)} | ${median.toFixed(1).padStart(6)} | ${midBody.toFixed(2).padStart(6)}(worst ${worstBody.toFixed(1)}) | ${(100*inBand/total).toFixed(0)}% | vmMax@x=${xMax.toFixed(1)} dist=${distClamp.toFixed(1)}mm`);
}
