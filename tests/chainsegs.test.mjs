// chainsegs.test.mjs — S176 chainSegments 验证
import { chainSegments } from '../src/sketch/chainsegs.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c?'PASS':'FAIL'}  ${m}`); if(!c) fail++; };

// T1 闭合方形（4 段成环，乱序）
const sq = [[[0,0],[10,0]],[[10,10],[0,10]],[[10,0],[10,10]],[[0,10],[0,0]]];
const r1 = chainSegments(sq);
ok(r1.length===1, `方形 → 1 条链 (实际 ${r1.length})`);
ok(r1[0]?.closed===true, '方形 → 闭合');
ok(r1[0]?.pts.length===4, `方形 → 4 顶点（去重尾点）(实际 ${r1[0]?.pts.length})`);

// T2 开放 L（端点度=1）
const lshape = [[[0,0],[10,0]],[[10,0],[10,10]]];
const r2 = chainSegments(lshape);
ok(r2.length===1 && r2[0].closed===false, 'L 形 → 1 条开放链');
ok(r2[0]?.pts.length===3, `L 形 → 3 顶点 (实际 ${r2[0]?.pts.length})`);

// T3 两个不相连闭环
const two = [...sq.map(([a,b])=>[a,b]), [[20,0],[30,0]],[[30,0],[30,10]],[[30,10],[20,10]],[[20,10],[20,0]]];
const r3 = chainSegments(two);
ok(r3.length===2, `两环 → 2 条链 (实际 ${r3.length})`);
ok(r3.every(c=>c.closed), '两环 → 都闭合');

// T4 空
ok(chainSegments([]).length===0, '空 → []');

// T5 重复段 + 自环 去除
const dup = [[[0,0],[10,0]],[[0,0],[10,0]],[[5,5],[5,5]],[[10,0],[10,10]]];
const r5 = chainSegments(dup);
ok(r5.length===1 && r5[0].pts.length===3, `重复段/自环去重 → 1 链 3 点 (实际 ${r5.length}链 ${r5[0]?.pts.length}点)`);

// T6 量化容差：子量化（<1/50mm）近重合端点接得上（computeRefGeo 实际共享精确端点，呢度验 sub-quant 容差）
const tol = [[[0,0],[10,0]],[[10.005,0],[10,10]]];
const r6 = chainSegments(tol);
ok(r6.length===1 && r6[0].pts.length===3, `sub-量化近重合端点连成一链 (实际 ${r6.length}链 ${r6[0]?.pts.length}点)`);

// T7 (audit HIGH/MED): 度-3 起点闭环 — 方形 + 喺角 [0,0] 嘅刺（spur）→ 任何输出闭环都【唔可以】头==尾（dup-tail 已 strip）
const spur = [[[0,0],[10,0]],[[10,0],[10,10]],[[10,10],[0,10]],[[0,10],[0,0]], [[0,0],[0,-10]]];
const r7 = chainSegments(spur);
const anyDupTail = r7.some(c => c.pts.length>1 && c.pts[0][0]===c.pts[c.pts.length-1][0] && c.pts[0][1]===c.pts[c.pts.length-1][1]);
ok(!anyDupTail, `方形+刺：无闭环留重复头尾点（${r7.map(c=>(c.closed?'C':'O')+c.pts.length).join(',')}）`);
ok(r7.some(c=>c.closed), '方形+刺：方形部分仍成闭环');

// T8 (audit MED): 转角 tie-break 令分支节点分解【确定】— 两格共享内壁，两种输入次序 → 同一组链（签名一致）
const cellsA = [[[0,0],[10,0]],[[10,0],[10,10]],[[10,10],[0,10]],[[0,10],[0,0]],[[10,0],[20,0]],[[20,0],[20,10]],[[20,10],[10,10]]];
const cellsB = [cellsA[6],cellsA[2],cellsA[0],cellsA[5],cellsA[3],cellsA[1],cellsA[4]];  // 打乱次序
const sig = (chains) => chains.map(c => (c.closed?'C':'O')+':'+[...c.pts].map(p=>p.join(',')).sort().join(';')).sort().join(' || ');
ok(sig(chainSegments(cellsA))===sig(chainSegments(cellsB)), '两格共享壁：分解不受输入次序影响（确定）');

console.log(fail===0?'\n全部通过':`\n${fail} 项失败`);
process.exit(fail===0?0:1);
