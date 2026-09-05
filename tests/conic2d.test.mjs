// conic2d.test.mjs — S177 sampleConic 验证（有理二次圆锥曲线）
import { sampleConic, conicShoulder, rhoToWeight } from '../src/cad/conic2d.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };
const close = (a, b, e = 1e-9) => Math.abs(a - b) <= e;
const P0 = [0, 0], P2 = [10, 0], APEX = [5, 10];
const M = [5, 0];  // 弦中点

// T1 端点精确
const r1 = sampleConic(P0, P2, APEX, 0.5, 33);
ok(close(r1[0][0], 0) && close(r1[0][1], 0), `首点精确 P0 (实际 ${r1[0]})`);
ok(close(r1[32][0], 10) && close(r1[32][1], 0), `末点精确 P2 (实际 ${r1[32]})`);
ok(r1.length === 33, `采样数 33 (实际 ${r1.length})`);

// T2 rho=0.5 = 普通二次 Bézier（抛物线）：w=1，B(t)=(1-t)²P0+2t(1-t)P1+t²P2
ok(close(rhoToWeight(0.5), 1), `rho0.5→w1 (实际 ${rhoToWeight(0.5)})`);
const bez = (t) => [ (1-t)**2*P0[0] + 2*t*(1-t)*APEX[0] + t*t*P2[0], (1-t)**2*P0[1] + 2*t*(1-t)*APEX[1] + t*t*P2[1] ];
const r2 = sampleConic(P0, P2, APEX, 0.5, 11);
let bezOK = true; for (let i = 0; i < 11; i++) { const t = i/10, b = bez(t); if (!close(r2[i][0], b[0], 1e-9) || !close(r2[i][1], b[1], 1e-9)) bezOK = false; }
ok(bezOK, 'rho=0.5 逐点等于普通二次 Bézier（抛物线）');

// T3 肩点：t=0.5 采样点 == conicShoulder == M + rho·(APEX-M)
const r3 = sampleConic(P0, P2, APEX, 0.5, 3);  // 3 点 → 中点 = t=0.5
const sh = conicShoulder(P0, P2, APEX, 0.5);
ok(close(r3[1][0], sh[0]) && close(r3[1][1], sh[1]), `中采样点==肩点 (采样 ${r3[1]} vs 肩 ${sh})`);
ok(close(sh[0], 5) && close(sh[1], 5), `rho0.5 肩点 = (M+APEX)/2 = [5,5] (实际 ${sh})`);

// T4 充满度单调：rho 越大，肩点离弦中点 M 越远（越「饱满」靠近 apex）
const dist = (rho) => { const s = conicShoulder(P0, P2, APEX, rho); return Math.hypot(s[0]-M[0], s[1]-M[1]); };
const d2 = dist(0.2), d5 = dist(0.5), d8 = dist(0.8);
ok(d2 < d5 && d5 < d8, `肩点离弦距随 rho 单增 (0.2→${d2.toFixed(2)} 0.5→${d5.toFixed(2)} 0.8→${d8.toFixed(2)})`);

// T5 椭圆(rho<0.5) 比抛物(0.5) 平、双曲(rho>0.5) 比抛物饱满（同 apex 同弦）
ok(dist(0.4) < dist(0.5) && dist(0.5) < dist(0.6), 'rho<0.5 椭圆更平 / >0.5 双曲更饱满');

// T6 无 NaN / 全有限（含极端 rho）
const r6 = [...sampleConic(P0, P2, APEX, 0.01, 20), ...sampleConic(P0, P2, APEX, 0.99, 20)];
ok(r6.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])), '极端 rho（0.01/0.99）无 NaN/全有限');

// T7 rho clamp：rho=0 / 1 / 负 / >1 唔崩，落入 (0.001,0.999)
ok(rhoToWeight(0) > 0 && Number.isFinite(rhoToWeight(1)) && rhoToWeight(-5) > 0 && Number.isFinite(rhoToWeight(9)), 'rho 越界被 clamp（无 0/∞ 权）');

// T8 samples<2 退化保护 → 至少 2 点（首尾）
const r8 = sampleConic(P0, P2, APEX, 0.5, 1);
ok(r8.length === 2 && close(r8[0][0], 0) && close(r8[1][0], 10), `samples<2 → 2 点首尾 (实际 ${r8.length})`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
