// p5-modal-probe2.mjs — resolution convergence sweep, cross-section well-resolved.
// Probes whether error -> 0 as the beam cross-section is resolved by many voxels.
import { runVoxelModal } from '../src/analysis/voxelfea.ts';

const E = 200000, nu = 0.3, rho = 7.85, rhoT = rho * 1e-9, beta1L = 1.875104;
function boxMesh(sx, sy, sz){const v=[];for(let b=0;b<8;b++)v.push((b&1)?sx:0,(b&2)?sy:0,(b&4)?sz:0);
  const t=[0,1,3,0,3,2,4,5,7,4,7,6,0,4,5,0,5,1,2,3,7,2,7,6,0,2,6,0,6,4,1,5,7,1,7,3];return{vertices:v,triangles:t};}
function anaF1(L,b,hh){const A=b*hh,I=b*hh**3/12;return beta1L**2/(2*Math.PI)*Math.sqrt(E*I/(rhoT*A*L**4));}

// L=100, cross section 10x10. To get N voxels across the 10mm thickness we need
// resolution ~ N * (L/10). E.g. thickness spans t voxels: res = t*10.
const L=100,b=10,hh=10;
const fAna=anaF1(L,b,hh);
console.log(`analytical f1 (100x10x10 steel) = ${fAna.toFixed(2)} Hz\n`);
console.log('res  thickVox  nVox   f1(Hz)   relErr%   (t s)');
const mesh=boxMesh(L,b,hh);
const fixed={point:[0,5,5],normal:[1,0,0]};
for(const res of [10,20,30,40,50,60]){
  const t0=Date.now();
  const r=runVoxelModal({...mesh,E,nu,rho,resolution:res,fixed,nModes:2});
  const dt=((Date.now()-t0)/1000).toFixed(1);
  if(!r.ok){console.log(`${res}: FAIL ${r.error}`);continue;}
  const thickVox=Math.round(hh/r.h);
  const f1=r.freqs[0];
  const err=(f1-fAna)/fAna*100;
  console.log(`${String(res).padEnd(4)} ${String(thickVox).padEnd(9)} ${String(r.nVox).padEnd(6)} ${f1.toFixed(1).padEnd(8)} ${err.toFixed(2).padEnd(9)} (${dt})`);
}
