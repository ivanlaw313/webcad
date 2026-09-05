// feacsv.test.mjs — S173 buildFeaCsv 纯函数验证
// 跑法: npx -y tsx tests/feacsv.test.mjs
import { buildFeaCsv } from '../src/analysis/feacsv.ts';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// ---- T1 最小结果（无可选场）----
const minimal = {
  h: 5, nVox: 2, centers: [0, 0, 0, 10, 2, 3], vm: [100, 50], vmMax: 100, dispMax: 0.1,
  disp: [0.1, 0.05], converged: true, residual: 1e-7, warnings: [], sy: 250, matName: '钢',
};
const csvMin = buildFeaCsv(minimal);
const linesMin = csvMin.split('\r\n');
ok(csvMin.charCodeAt(0) === 0xFEFF, `UTF-8 BOM 前缀 (charCode ${csvMin.charCodeAt(0).toString(16)})`);
// summary 11 行 + blank + header + 2 data = 15
ok(linesMin.length === 15, `最小：行数 = 11摘要+1空+1头+2体素 = 15 (实际 ${linesMin.length})`);
ok(linesMin.some((l) => l.startsWith('安全系数 SF,2.5')), `SF = sy/vmMax = 250/100 = 2.5 (${linesMin.find((l) => l.startsWith('安全系数'))})`);
const hdrMin = linesMin.find((l) => l.startsWith('序号'));
ok(hdrMin.split(',').length === 7, `最小表头 7 列（无 σ/sed）(实际 ${hdrMin.split(',').length})`);
const dataMin = linesMin[linesMin.length - 2]; // first data row (序号 1)
ok(dataMin.startsWith('1,0,0,0,100,,0.1'), `首体素行：1,x,y,z,vm,(空平滑),disp = "${dataMin}"`);
ok(linesMin[linesMin.length - 1].startsWith('2,10,2,3,50,,0.05'), `次体素行 = "${linesMin[linesMin.length - 1]}"`);

// ---- T2 完整结果（reaction + s1/s3/shear + sed + vmSmooth）----
const full = {
  h: 4, nVox: 1, centers: [1, 2, 3], vm: [120], vmMax: 120, dispMax: 0.2, disp: [0.2],
  converged: false, residual: 3e-4, warnings: ['网格粗', '近边界'], sy: 200, matName: '铝合金',
  vmSmooth: [118], reaction: [10, -20, 30], reactionMag: 37.4, s1: [130], s3: [-15], shear: [72], sed: [0.0042],
};
const csvFull = buildFeaCsv(full);
const linesFull = csvFull.split('\r\n');
const hdrFull = linesFull.find((l) => l.startsWith('序号'));
ok(hdrFull.split(',').length === 11, `完整表头 11 列（+σ1/σ3/τ +应变能）(实际 ${hdrFull.split(',').length})`);
ok(linesFull.some((l) => l.startsWith('支座反力')), '完整：有支座反力行');
ok(linesFull.some((l) => l.startsWith('|反力| (N),37.4')), '完整：|反力| 行 = 37.4');
ok(linesFull.some((l) => l.startsWith('收敛,否')), '完整：收敛=否');
ok(linesFull.some((l) => l.includes('网格粗; 近边界')), '完整：警告用 ; 连接');
const dataFull = linesFull[linesFull.length - 1];
ok(dataFull === '1,1,2,3,120,118,0.2,130,-15,72,0.0042', `完整体素行全列 = "${dataFull}"`);

// ---- T3 转义：matName 含逗号 → 加引号 ----
const comma = { ...minimal, matName: '钢, AISI 1045', nVox: 1, centers: [0, 0, 0], vm: [1], disp: [0] };
const csvC = buildFeaCsv(comma);
ok(csvC.includes('材料,"钢, AISI 1045"'), `含逗号材质名被引号包裹 (${csvC.split('\r\n').find((l) => l.startsWith('材料'))})`);

// ---- T4 vmMax=0 → SF = N/A（无除零）----
const zero = { ...minimal, vmMax: 0, vm: [0, 0] };
ok(buildFeaCsv(zero).split('\r\n').some((l) => l === '安全系数 SF,N/A'), 'vmMax=0 → SF=N/A（唔除零）');

// ---- T5 行数随 nVox 线性（大网格）----
const big = { ...minimal, nVox: 100, centers: new Float32Array(300), vm: new Float32Array(100), disp: new Float32Array(100) };
ok(buildFeaCsv(big).split('\r\n').length === 11 + 1 + 1 + 100, `nVox=100 → 113 行 (实际 ${buildFeaCsv(big).split('\r\n').length})`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
