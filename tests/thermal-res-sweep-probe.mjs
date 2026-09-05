// thermal-res-sweep-probe.mjs — ADDITIVE：分辨率扫描，睇 Q 同 vmMax 收敛趋势
import { _internals } from '../src/analysis/voxelfea.ts';
const { runVoxelThermal, runVoxelThermalStress } = _internals;
function boxMesh(sx, sy, sz){const v=[];for(let b=0;b<8;b++)v.push((b&1)?sx:0,(b&2)?sy:0,(b&4)?sz:0);
  const t=[0,1,3,0,3,2,4,5,7,4,7,6,0,4,5,0,5,1,2,3,7,2,7,6,0,2,6,0,6,4,1,5,7,1,7,3];return{vertices:v,triangles:t};}
const L=100,W=20,Hh=20,k=50,Thot=100,Tcold=0;
const m=boxMesh(L,W,Hh);
const A_m2=(W*1e-3)*(Hh*1e-3), L_m=L*1e-3, Qana=k*A_m2*(Thot-Tcold)/L_m;
const E=200000,nu=0.3,cte=12,DT=50,SIG=E*(cte*1e-6)*DT;
console.log('Qanalytic='+Qana.toFixed(4)+' W  SIGanalytic='+SIG.toFixed(2)+' MPa');
console.log('res | nVox | Q(W) relErr% | vmMax(MPa) relErr% | dispMax  | freeExpVM');
for(const res of [8,12,16,20,24,32,40]){
  const rt=runVoxelThermal({vertices:m.vertices,triangles:m.triangles,
    hot:{point:[0,0,0],normal:[1,0,0]},cold:{point:[L,0,0],normal:[1,0,0]},Thot,Tcold,k,resolution:res});
  const relQ=Math.abs(rt.heatFlowW-Qana)/Qana*100;
  const rs=runVoxelThermalStress({vertices:m.vertices,triangles:m.triangles,
    fixed:{point:[0,0,0],normal:[1,0,0]},fixed2:{point:[L,0,0],normal:[1,0,0]},
    hot:{point:[0,0,0],normal:[1,0,0]},cold:{point:[L,0,0],normal:[1,0,0]},
    Thot:20+DT,Tcold:20+DT,Tref:20,E,nu,cte,k,resolution:res});
  const relS=Math.abs(rs.vmMax-SIG)/SIG*100;
  // free expansion (3 orthogonal rollers) → σ≈0 test at this res
  const rf=runVoxelThermalStress({vertices:m.vertices,triangles:m.triangles,fixCon:'roller',
    fixed:{point:[0,0,0],normal:[1,0,0]},fixed2:{point:[0,0,0],normal:[0,1,0]},fixed3:{point:[0,0,0],normal:[0,0,1]},
    hot:{point:[0,0,0],normal:[1,0,0]},cold:{point:[L,0,0],normal:[1,0,0]},
    Thot:20+DT,Tcold:20+DT,Tref:20,E,nu,cte,k,resolution:res});
  console.log(`${String(res).padStart(3)} | ${String(rt.nVox).padStart(5)} | ${rt.heatFlowW.toFixed(3).padStart(7)} ${relQ.toFixed(2).padStart(6)} | ${rs.vmMax.toFixed(2).padStart(8)} ${relS.toFixed(1).padStart(6)} | ${rs.dispMax.toExponential(2)} | ${rf.vmMax.toExponential(2)}`);
}
