// mold-component-frame.test.mjs — 验证「模流喺网格组件上跑」嘅坐标系一致性
// 跑: npx -y tsx tests/mold-component-frame.test.mjs
//
// 关键不变量：模流 mesh 由 moldTargetMesh bake = Rx(+90°)·compWorldMatrix·V_local；
//   浇口由 moldPickAt 转 = [x,−z,y]·(三维世界点) = Rx(+90°)·P_three，而 P_three = compWorldMatrix·V_local。
//   ⇒ 两者必须落同一 CAD 帧（bake 嘅 mesh 同点击嘅浇口对齐，零错位）。本测试用 three Matrix4 复算确认。
import { Matrix4, Euler, Vector3 } from 'three'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

// store.compWorldMatrix 复刻（无 group/fk 简化版）：T(pos)·[rot around gc]·Rx(-90°)
function compWorldMatrix(pos, rot, gc) {
  const M = new Matrix4()
  M.multiply(new Matrix4().makeTranslation(pos[0], pos[1], pos[2]))
  if (rot && (rot[0] || rot[1] || rot[2])) {
    const d = Math.PI / 180
    M.multiply(new Matrix4().makeTranslation(gc[0], gc[1], gc[2]))
    M.multiply(new Matrix4().makeRotationFromEuler(new Euler(rot[0] * d, rot[1] * d, rot[2] * d)))
    M.multiply(new Matrix4().makeTranslation(-gc[0], -gc[1], -gc[2]))
  }
  M.multiply(new Matrix4().makeRotationX(-Math.PI / 2))
  return M
}
// moldTargetMesh bake：Rx(+90°)·compWorldMatrix
function bake(pos, rot, gc, vLocal) {
  const e = new Matrix4().makeRotationX(Math.PI / 2).multiply(compWorldMatrix(pos, rot, gc)).elements
  const x = vLocal[0], y = vLocal[1], z = vLocal[2]
  return [e[0]*x+e[4]*y+e[8]*z+e[12], e[1]*x+e[5]*y+e[9]*z+e[13], e[2]*x+e[6]*y+e[10]*z+e[14]]
}
// 渲染：三维世界点 = compWorldMatrix·V_local（R3F 组层级）
function renderThree(pos, rot, gc, vLocal) {
  return new Vector3(vLocal[0], vLocal[1], vLocal[2]).applyMatrix4(compWorldMatrix(pos, rot, gc)).toArray()
}
// moldPickAt：三维世界点 → CAD = [x,−z,y]
const pickCad = (P) => [P[0], -P[2], P[1]]
const near = (a, b, t = 1e-9) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]) < t

// 几个有代表性嘅组件位姿 + 局部点
const cases = [
  { pos: [0,0,0], rot: undefined, gc: [0,0,0], v: [10,20,30] },          // 原点无旋
  { pos: [130,0,0], rot: undefined, gc: [0,0,0], v: [5,-7,12] },          // 导入 STL 典型 pos=[originX,0,0]
  { pos: [40,15,-20], rot: [30,0,0], gc: [3,4,5], v: [8,2,9] },           // 平移 + 绕 X 旋
  { pos: [-25,50,10], rot: [10,45,-20], gc: [1,1,1], v: [-6,11,4] },      // 任意三轴旋
]
console.log('坐标系一致性：bake(mesh) 同 pickCad(渲染点) 必须同帧')
for (let i = 0; i < cases.length; i++) {
  const { pos, rot, gc, v } = cases[i]
  const baked = bake(pos, rot, gc, v)
  const clicked = pickCad(renderThree(pos, rot, gc, v))
  ok(near(baked, clicked), `case${i+1} pos=${pos} rot=${rot||'none'}: bake=[${baked.map(n=>n.toFixed(2))}] == 浇口=[${clicked.map(n=>n.toFixed(2))}]`)
}

// 额外：纯平移件，bake 应保持形状（两点距离不变 = 刚体）
{
  const a = bake([130,0,0], undefined, [0,0,0], [0,0,0])
  const b = bake([130,0,0], undefined, [0,0,0], [10,0,0])
  ok(Math.abs(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]) - 10) < 1e-9, `bake 保距（刚体）：|Δ|=10 局部 → ${Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]).toFixed(4)} CAD`)
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 模流组件坐标系一致 (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
