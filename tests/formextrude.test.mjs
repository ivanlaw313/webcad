// formextrude.test.mjs — S165 extrudeQuadFace（Form cage 面擠出 / push-pull）验证
//   Fusion T-spline「由 box 拉手臂/凸台」核心操作。npx tsx tests/formextrude.test.mjs 直跑。
//   覆盖：①quad+4 / vert+4 计数 ②细分仍水密 2-manifold（唔 throw）③体积单调（外增内减）
//         ④连续两次擠同一新帽面照样水密 ⑤winding：全 quad 法向一致向外（有向体积符号）
import { makeBoxCage, extrudeQuadFace, ccSubdivide, quadsToTris } from '../src/cad/subdiv.ts';

let fail = 0;
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// —— 独立小工具（唔 import 内部私有守卫，各自算，作 subdiv.ts 之外嘅第三方交叉验证）——
// 每条无向边恰 2 quad = 闭合 2-流形（同 ccSubdivide 入口守卫同款判据）
const manifold = (m) => {
  const nV = m.verts.length, cnt = new Map();
  for (const q of m.quads) for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) & 3]; if (a === b) return false;
    const lo = Math.min(a, b), hi = Math.max(a, b); const k = lo * nV + hi;
    cnt.set(k, (cnt.get(k) || 0) + 1);
  }
  for (const c of cnt.values()) if (c !== 2) return false;
  return true;
};
// quad 有向体积（散度定理，扇形三角）；绕向统一向外 CCW → 正
const vol = (m) => {
  const v = m.verts; let s = 0;
  for (const q of m.quads) for (const [a, b, c] of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
    const A = v[a], B = v[b], C = v[c];
    s += A[0] * (B[1] * C[2] - B[2] * C[1]) + A[1] * (B[2] * C[0] - B[0] * C[2]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
  }
  return s / 6;
};
// 从三角化结果（quadsToTris）独立算体积 — 验 bake 出嘅实体，唔靠 quad 层公式
const triVol = (t) => {
  const V = t.vertices, T = t.triangles; let s = 0;
  for (let i = 0; i < T.length; i += 3) {
    const a = T[i] * 3, b = T[i + 1] * 3, c = T[i + 2] * 3;
    const A = [V[a], V[a + 1], V[a + 2]], B = [V[b], V[b + 1], V[b + 2]], C = [V[c], V[c + 1], V[c + 2]];
    s += A[0] * (B[1] * C[2] - B[2] * C[1]) + A[1] * (B[2] * C[0] - B[0] * C[2]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
  }
  return s / 6;
};
const allQuad = (m) => m.quads.every(q => q.length === 4 && new Set(q).size === 4);

// 参考笼：2×2×2 盒（每面 nx×ny 段）→ 面数 = 6 面 × 每面 4 = 24 quad
const box = makeBoxCage(20, 20, 20, 2, 2, 2);
ok(manifold(box) && vol(box) > 0, `基准盒笼水密且 vol>0 (${box.quads.length} quad, ${box.verts.length} vert, vol=${vol(box).toFixed(0)})`);

// ── ① 一个面擠出 → quad +4、vert +4 ──────────────────────────────────────
const faceIdx = 0;   // 底面第一格（−Z 面之一）
const q0 = box.quads.length, v0 = box.verts.length;
const ex = extrudeQuadFace(box, faceIdx, 8);
ok(ex !== null, '擠出返回非 null（合法 manifold）');
ok(ex.quads.length === q0 + 4, `quad 数 +4：${q0} → ${ex.quads.length}`);
ok(ex.verts.length === v0 + 4, `顶点数 +4：${v0} → ${ex.verts.length}`);
ok(allQuad(ex), '擠出结果全 quad（无退化/自环）');
// 唔可 mutate 输入（Form formUndo 快照依赖 immutable）
ok(box.quads.length === q0 && box.verts.length === v0, '输入 cage 未被 mutate（immutable 惯例）');

// ── ② ccSubdivide(结果) 唔 throw（仍水密 2-manifold）─────────────────────
ok(manifold(ex), '擠出结果闭合 2-流形（每边恰 2 quad）');
let sub = null, subThrew = false;
try { sub = ccSubdivide(ex, 2); } catch { subThrew = true; }
ok(!subThrew, 'ccSubdivide(擠出结果, 2) 唔 throw（水密守卫通过）');
ok(sub && manifold(sub), '细分后仍闭合 2-流形');

// ── ③ 体积：外擠 |vol| 增、内压减（quadsToTris bake 出嘅实体体积）───────
const baseTV = Math.abs(triVol(quadsToTris(box)));
const outTV = Math.abs(triVol(quadsToTris(extrudeQuadFace(box, faceIdx, 8))));
ok(outTV > baseTV + 1e-6, `外擠体积增大：${baseTV.toFixed(0)} → ${outTV.toFixed(0)}`);
const inRes = extrudeQuadFace(box, faceIdx, -4);   // 向内压（凹陷），仍要 valid manifold
ok(inRes !== null && manifold(inRes), '向内压（dist<0）仍返合法 manifold');
const inTV = Math.abs(triVol(quadsToTris(inRes)));
ok(inTV < baseTV - 1e-6, `内压体积减小：${baseTV.toFixed(0)} → ${inTV.toFixed(0)}`);

// ── ④ 连续擠出两次同一面（新帽面照样水密）─────────────────────────────
// extrudeQuadFace 把帽面放返原 faceIdx 槽 → 用同一 index 再擠 = 抽长肢
const twice = extrudeQuadFace(extrudeQuadFace(box, faceIdx, 6), faceIdx, 6);
ok(twice !== null, '连续两次擠出返回非 null');
ok(twice.quads.length === q0 + 8 && twice.verts.length === v0 + 8, `两次擠 quad+8 / vert+8：${twice.quads.length} quad, ${twice.verts.length} vert`);
ok(manifold(twice), '两次擠出后仍闭合 2-流形');
let twiceThrew = false; try { ccSubdivide(twice, 2); } catch { twiceThrew = true; }
ok(!twiceThrew, '两次擠出结果可细分（唔 throw）');
const twiceTV = Math.abs(triVol(quadsToTris(twice)));
ok(twiceTV > outTV, `抽长肢体积单调增：一次擠 ${outTV.toFixed(0)} → 两次擠 ${twiceTV.toFixed(0)}`);

// ── ⑤ winding：全部 quad 法向一致（有向半边配对 + 有向体积符号验）─────────
// winding 一致 = 闭合定向流形嘅严格判据：每条【有向半边 (a→b)】喺整个 mesh 恰好出现一次，
// 其反向 (b→a) 亦恰好一次（相邻面共边 = 一正一反）。任一 quad 绕向翻转即打破呢个配对。
// 呢个判据对【凹陷】都成立（唔似「法向·(面心−形心)」只对凸体啱）。再加 signed-vol>0 定「一致向【外】」。
const windingConsistent = (m) => {
  const nV = m.verts.length;
  const half = new Map();   // 有向半边 a*nV+b → 出现次数
  for (const q of m.quads) for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) & 3]; const k = a * nV + b;
    half.set(k, (half.get(k) || 0) + 1);
  }
  let bad = 0;
  for (const [k, cnt] of half) {
    const a = Math.floor(k / nV), b = k % nV;
    const rev = half.get(b * nV + a) || 0;
    if (cnt !== 1 || rev !== 1) bad++;   // 每有向半边唯一 + 反向唯一 ⇒ 邻面绕向相反 ⇒ 全体一致定向
  }
  return bad === 0;
};
const exOut = extrudeQuadFace(box, faceIdx, 8);
ok(windingConsistent(exOut), '外擠：全 quad 绕向一致（有向半边配对：每条边一正一反）');
ok(vol(exOut) > 0, '外擠 signed-vol > 0（一致定向【向外】）');
ok(windingConsistent(inRes), '内压：全 quad 绕向一致（凹陷都通过有向半边配对）');
ok(vol(inRes) > 0, '内压 signed-vol 仍 > 0（绕向未翻，仍向外）');
ok(windingConsistent(twice), '两次擠出（抽长肢）：全 quad 绕向仍一致');

// ── 守卫 no-op：dist≈0 / faceIdx 越界 / 内压过深穿对壁 → 返 null ──────────
ok(extrudeQuadFace(box, faceIdx, 0) === null, 'dist≈0 → null（诚实 no-op）');
ok(extrudeQuadFace(box, 999, 8) === null, 'faceIdx 越界 → null');
ok(extrudeQuadFace(box, -1, 8) === null, 'faceIdx<0 → null');
ok(extrudeQuadFace(box, 1.5, 8) === null, 'faceIdx 非整数 → null');
ok(extrudeQuadFace(box, faceIdx, -1e6) === null, '内压过深（穿对壁翻转自交）→ null（signed-vol 守卫）');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
