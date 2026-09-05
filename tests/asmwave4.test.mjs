// GM-3DV4（装配 Wave 4）纯逻辑单测：
//   A2 双原点 offset/flip（computeFK restOffset） · A1 resolveJointOrigin · A10 inferAsBuiltAxis · A12 explodeStepOffsets
// 跑：npx -y tsx tests/asmwave4.test.mjs（喺 C:\ClaudeCode\webcad）
import { computeFK, resolveJointOrigin, JOINT_DOF } from '../src/assembly/kinematics.ts'
import { inferAsBuiltAxis, explodeStepOffsets } from '../src/assembly/asmUtil.ts'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const eq = (a, b, e = 1e-6) => Math.abs(a - b) < e
const tr = (M) => [M.elements[12], M.elements[13], M.elements[14]]   // Matrix4 平移分量

const baseJ = (patch) => ({ id: 'J1', name: 'j', type: 'revolute', parent: 'GND', child: 'C', anchor: [0, 0, 0], axis: [0, 0, 1], angle: 0, slide: 0, ...patch })

console.log('① A2 旧关节零回归：无 offset/flip → rest 位 = 单位（child 平移 0）')
{
  const M = computeFK(['GND', 'C'], [baseJ({})]).get('C')
  const t = tr(M)
  ok(eq(t[0], 0) && eq(t[1], 0) && eq(t[2], 0), `无偏移 @angle0 → child 平移 [0,0,0]（实 ${t.map((x) => x.toFixed(3))}）`)
  // slider 无 offset：slide=10 沿 X → 平移 [10,0,0]（逐字节旧行为）
  const Ms = computeFK(['GND', 'C'], [baseJ({ type: 'slider', axis: [1, 0, 0], slide: 10 })]).get('C')
  const ts = tr(Ms)
  ok(eq(ts[0], 10) && eq(ts[1], 0) && eq(ts[2], 0), `slider slide10 无偏移 → [10,0,0]（实 ${ts.map((x) => x.toFixed(2))}）`)
}

console.log('② A2 静止偏移（关节基 U/V/轴）：offset 沿 U → child 平移')
{
  // 约定：axis=[0,0,1]、ref=[1,0,0] → u=cross(axis,ref)=[0,1,0]、v=[-1,0,0]
  // offset=[5,0,0]（沿 U 5）→ world d = 5·u = [0,5,0]
  const M = computeFK(['GND', 'C'], [baseJ({ offset: [5, 0, 0] })]).get('C')
  const t = tr(M)
  ok(eq(t[0], 0) && eq(t[1], 5) && eq(t[2], 0), `offset 沿U=5 @angle0 → [0,5,0]（实 ${t.map((x) => x.toFixed(3))}）`)
  // 沿轴偏移（第三分量）→ 沿 axis
  const Ma = computeFK(['GND', 'C'], [baseJ({ offset: [0, 0, 7] })]).get('C')
  const ta = tr(Ma)
  ok(eq(ta[0], 0) && eq(ta[1], 0) && eq(ta[2], 7), `offset 沿轴=7 → [0,0,7]（实 ${ta.map((x) => x.toFixed(3))}）`)
}

console.log('③ A2 偏移臂随驱动摆动：offset 沿U + 转 90° → 绕轴扫到 v 方向')
{
  // child @ [0,5,0]（沿U），绕 z 转 90° → R_z(90)·[0,5,0] = [-5,0,0]
  const M = computeFK(['GND', 'C'], [baseJ({ offset: [5, 0, 0], angle: 90 })]).get('C')
  const t = tr(M)
  ok(eq(t[0], -5, 1e-4) && eq(t[1], 0, 1e-4) && eq(t[2], 0, 1e-4), `offset 臂 + 转90° → [-5,0,0]（实 ${t.map((x) => x.toFixed(3))}）`)
}

console.log('④ A2 Flip：反转轴向 → 偏移落对边 + 转向反')
{
  // flip → axis=[0,0,-1]；u=cross([0,0,-1],[1,0,0])=[0,-1,0]；offset 沿U=5 → d=[0,-5,0]
  const M = computeFK(['GND', 'C'], [baseJ({ offset: [5, 0, 0], flip: true })]).get('C')
  const t = tr(M)
  ok(eq(t[1], -5, 1e-4), `flip + offset 沿U=5 → y=-5（对边，实 ${t[1].toFixed(3)}）`)
  // flip 令 +90° 变绕 -z → 与不 flip 嘅 90° 镜像
  const Mf = computeFK(['GND', 'C'], [baseJ({ offset: [0, 0, 0], axis: [0, 1, 0], angle: 30, flip: true })]).get('C')
  const Mn = computeFK(['GND', 'C'], [baseJ({ offset: [0, 0, 0], axis: [0, 1, 0], angle: 30, flip: false })]).get('C')
  // 纯旋转、anchor 原点 → 平移都系 0，但旋转方向相反：比 R 矩阵 element[0] (cos) 相同、element[2]/[8] 反号
  ok(eq(Mf.elements[0], Mn.elements[0], 1e-6) && eq(Mf.elements[8], -Mn.elements[8], 1e-6), 'flip 旋转 = 反向（R 反对称元反号）')
}

console.log('⑤ A1 resolveJointOrigin：point+offset / 轴对齐 / flip / 缺省轴')
{
  const r1 = resolveJointOrigin({ id: 'JO1', name: 'o', point: [1, 2, 3], mode: 'simple', angle: 0, offset: [10, 0, 0], flip: false, axis: [0, 0, 1] })
  ok(eq(r1.anchor[0], 11) && eq(r1.anchor[1], 2) && eq(r1.anchor[2], 3), `anchor = point+offset = [11,2,3]（实 ${r1.anchor}）`)
  ok(eq(r1.axis[2], 1), '轴对齐 = [0,0,1]')
  const r2 = resolveJointOrigin({ id: 'JO2', name: 'o', point: [0, 0, 0], mode: 'simple', angle: 0, offset: [0, 0, 0], flip: true, axis: [0, 0, 1] })
  ok(eq(r2.axis[2], -1), 'flip → 轴反向 [0,0,-1]')
  const r3 = resolveJointOrigin({ id: 'JO3', name: 'o', point: [0, 0, 0], mode: 'simple', angle: 0, offset: [0, 0, 0], flip: false })
  ok(eq(r3.axis[0], 0) && eq(r3.axis[1], 0) && eq(r3.axis[2], 1), '缺省轴 = 世界 +Z')
}

console.log('⑥ A10 inferAsBuiltAxis：共享接触带主轴 = 销轴（X/Y/Z 三向）')
{
  // 造两条重叠嘅圆环管（沿指定轴 permute），接触带 = 两者重叠段 → 伸长方向 = 该轴
  const tube = (axisIdx, z0, z1) => {
    const v = []
    for (let z = z0; z <= z1; z += 2) for (let a = 0; a < 360; a += 30) {
      const c = [5 * Math.cos(a * Math.PI / 180), 5 * Math.sin(a * Math.PI / 180), z]
      // permute：axisIdx 分量 = z（长轴），其余 = 环
      const p = [0, 0, 0]; p[axisIdx] = c[2]; p[(axisIdx + 1) % 3] = c[0]; p[(axisIdx + 2) % 3] = c[1]
      v.push(p[0], p[1], p[2])
    }
    return v
  }
  for (const [name, idx] of [['X', 0], ['Y', 1], ['Z', 2]]) {
    const A = tube(idx, 0, 30), B = tube(idx, 10, 40)   // 重叠段 10..30（高 20 > 直径 10 → 长轴）
    const ax = inferAsBuiltAxis(A, B, [0, 1, 0])
    const dom = ax.map(Math.abs).indexOf(Math.max(...ax.map(Math.abs)))
    ok(dom === idx, `销轴沿 ${name} → 推断主分量 = ${name}（实 ${ax.map((x) => x.toFixed(2))}）`)
  }
  // 退化输入 → fallback
  ok(inferAsBuiltAxis([], [1, 2, 3], [0, 1, 0]).join() === '0,1,0', '空输入 → fallback [0,1,0]')
}

console.log('⑦ A12 explodeStepOffsets：有序步 · 进度覆盖 · 累积 · 方向归一')
{
  const steps = [{ ids: ['a'], dir: [1, 0, 0], dist: 10 }, { ids: ['b'], dir: [0, 1, 0], dist: 20 }]
  const at0 = explodeStepOffsets(steps, 0)
  ok(at0.size === 0, 't=0 → 无偏移')
  const at05 = explodeStepOffsets(steps, 0.5)   // 覆盖第一步全额、第二步 0
  ok(at05.get('a')?.[0] === 10 && !at05.has('b'), 't=0.5 → a=[10,0,0]、b 未动')
  const at1 = explodeStepOffsets(steps, 1)
  ok(at1.get('a')[0] === 10 && at1.get('b')[1] === 20, 't=1 → a=[10,0,0] b=[0,20,0]')
  const at025 = explodeStepOffsets(steps, 0.25)   // 第一步半程
  ok(eq(at025.get('a')[0], 5), 't=0.25 → a 半程 [5,0,0]')
  // 累积：一件入两步
  const acc = explodeStepOffsets([{ ids: ['x'], dir: [1, 0, 0], dist: 4 }, { ids: ['x'], dir: [1, 0, 0], dist: 6 }], 1)
  ok(eq(acc.get('x')[0], 10), '同件入两步 → 累积 4+6=10')
  // 方向归一：非单位向量
  const norm = explodeStepOffsets([{ ids: ['y'], dir: [3, 0, 0], dist: 10 }], 1)
  ok(eq(norm.get('y')[0], 10), '非单位方向 [3,0,0] → 归一后 dist=10')
  ok(explodeStepOffsets([], 1).size === 0, '空步 → 空（保留径向缺省）')
}

console.log('⑧ A13 记录（webcad 抛离 Fusion 7 型）：8 关节类型含 screw/pinslot')
{
  const types = Object.keys(JOINT_DOF)
  ok(types.length === 8 && types.includes('screw') && types.includes('pinslot'), `8 型（实 ${types.length}）含 screw + pinslot`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 全部完成 (${pass} pass / ${fail} fail)`)
process.exit(fail ? 1 : 0)
