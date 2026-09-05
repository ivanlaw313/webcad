import { flowDirField } from '../src/analysis/moldflow.ts';
let fail=0; const ok=(c,m)=>{console.log(`${c?'PASS':'FAIL'}  ${m}`); if(!c)fail++;};
// 1D：5 体素沿 +X，fill 递增（浇口喺 x=0）→ 流向应 +X
const h=2, centers=[0,0,0, 2,0,0, 4,0,0, 6,0,0, 8,0,0], fill=[0,1,2,3,4], nVox=5;
const d=flowDirField(centers, fill, h, nVox);
const dir=(e)=>[d[e*3],d[e*3+1],d[e*3+2]];
ok(Math.abs(dir(2)[0]-1)<1e-6 && Math.abs(dir(2)[1])<1e-6 && Math.abs(dir(2)[2])<1e-6, `中间体素流向 +X (实际 [${dir(2).map(x=>x.toFixed(2))}])`);
ok(dir(0)[0]>0.9 && dir(4)[0]>0.9, '端体素流向都系 +X');
ok(d.length===nVox*3, '输出长度 nVox×3');
// 2D：fill 沿 +Y 递增 → 流向 +Y
const c2=[0,0,0, 0,2,0, 0,4,0], f2=[0,5,10];
const d2=flowDirField(c2,f2,2,3);
ok(Math.abs(d2[1*3+1]-1)<1e-6, `+Y 梯度 → 流向 +Y (实际 ${d2[1*3+1].toFixed(2)})`);
// 退化：h=0 → 零向量；零梯度（全相同 fill）→ 零向量
ok(flowDirField(centers,fill,0,nVox).every(x=>x===0), 'h=0 → 全零');
ok(flowDirField(centers,[1,1,1,1,1],h,nVox).every(x=>x===0), '零梯度 → 全零');
console.log(fail===0?'\n全部通过':`\n${fail} 项失败`);
process.exit(fail===0?0:1);
