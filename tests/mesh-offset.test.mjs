// mesh-offset.test.mjs — S188 网格 3D 均匀偏移（manifold minkowski 膨胀/腐蚀）
import { offsetMesh, meshVolume } from '../src/io/meshBool.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// 立方 [0,10]³ 8 顶点 12 三角，体积 1000
const V = [0,0,0, 10,0,0, 10,10,0, 0,10,0, 0,0,10, 10,0,10, 10,10,10, 0,10,10];
const T = [0,1,2, 0,2,3,  4,6,5, 4,7,6,  0,4,5, 0,5,1,  2,6,7, 2,7,3,  0,3,7, 0,7,4,  1,5,6, 1,6,2];
const cube = { vertices: V, triangles: T };
const bbox = (verts) => { let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9]; for (let i=0;i<verts.length;i+=3) for (let k=0;k<3;k++){ mn[k]=Math.min(mn[k],verts[i+k]); mx[k]=Math.max(mx[k],verts[i+k]); } return { mn, mx }; };

const main = async () => {
  ok(Math.abs(meshVolume(cube) - 1000) < 1e-6, `立方体积=1000 (实际 ${meshVolume(cube).toFixed(1)})`);

  // 外偏移 +1：体积应明显变大（圆角立方 ≈ 1000 + 6面板600 + 12棱+8角 ≈ 1700），bbox 扩到约 [-1,11]
  const out = await offsetMesh(cube, 1, 16);
  ok(out.triangles.length > 0, `外偏移结果非空 (${out.triangles.length/3} 三角)`);
  const vo = meshVolume(out);
  ok(vo > 1000, `外偏移 +1 体积变大 (${vo.toFixed(0)} > 1000)`);
  ok(vo < 2200, `外偏移 +1 体积合理上界 (${vo.toFixed(0)} < 2200，非翻转垃圾)`);
  const bo = bbox(out.vertices);
  ok(bo.mn[0] < -0.9 && bo.mn[0] > -1.1 && bo.mx[0] > 10.9 && bo.mx[0] < 11.1, `外偏移 bbox.x ≈ [-1,11] (实际 [${bo.mn[0].toFixed(2)},${bo.mx[0].toFixed(2)}])`);
  ok(out.normals.length === out.vertices.length, '外偏移有逐顶点法向');

  // 内偏移 -1：体积应变细（< 1000），bbox 缩到约 [1,9]
  const ins = await offsetMesh(cube, -1, 16);
  const vi = meshVolume(ins);
  ok(vi > 0 && vi < 1000, `内偏移 -1 体积变细 (${vi.toFixed(0)} < 1000)`);
  const bi = bbox(ins.vertices);
  ok(bi.mn[0] > 0.5 && bi.mx[0] < 9.5, `内偏移 bbox.x 收窄 (实际 [${bi.mn[0].toFixed(2)},${bi.mx[0].toFixed(2)}])`);

  // 零偏移：焊接复制，体积≈原
  const z = await offsetMesh(cube, 0);
  ok(Math.abs(meshVolume(z) - 1000) < 1e-3, `零偏移 = 原体积 (实际 ${meshVolume(z).toFixed(1)})`);

  // 内缩过度 → 蚀剩空 → 抛错
  let threw = false;
  try { await offsetMesh(cube, -20, 16); } catch { threw = true; }
  ok(threw, '内缩 -20（>半边长）蚀剩空 → 诚实抛错');
};

main().then(() => { console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`); process.exit(fail === 0 ? 0 : 1); })
  .catch((e) => { console.error('测试异常：', e); process.exit(1); });
