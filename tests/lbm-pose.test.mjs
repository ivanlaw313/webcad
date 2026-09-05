// 刚体位姿（拖住零件即时郁/转）嘅 headless 验收。
//
//   node --experimental-strip-types --test tests/lbm-pose.test.mjs
//
// 呢度冇 GPU（node 开唔到 WebGL2），所以分工係：
//
//  ① rigidPose.ts 係 solidBodyShaderSource() 嘅【CPU 镜像】。呢个档验嘅係【模型本身啱唔啱】
//     —— 即係「变换重采样出嚟嘅 mask」对唔对得住「喺嗰个姿态重新用 CPU 烘一次」。
//  ② 两边（GLSL vs CPU 镜像）真係一样呢件事，靠两样嘢钉死：
//     · 呢个档尾嗰组【结构性 GLSL 检查】（生成出嚟嘅 shader 一定要有嗰几句关键嘢）；
//     · 真 GPU fixture：readback solid atlas 同呢个 CPU 模型逐格比（要喺浏览器度行）。
//     ★ 单靠 ① 係唔够嘅，★ 报告一定要讲清楚 ② 行咗未 ★。
//
//
// ★★ 参考形状点解要「体积对得齐」★★
// ────────────────────────────────
// 一个 |x − 24.5| <= 9 嘅盒，格心取样会畀出 19 格（两边啱啱踩住格心，两边都收），
// 但佢嘅连续体积係 18。即係【烘焙嗰一下】已经把零件谷肥咗 5%。
// 攞呢种形状嚟验「重采样 vs 重烘」，量到嘅九成係呢个烘焙量化误差，唔係重采样误差 ——
// 实测体积偏差 +29%，然后就会有人去调容差。
// 所以参考形状嘅面一律摆喺【格边界】（半宽 = n + 0.5），咁 voxelize 出嚟嘅格数就
// 【啱啱等于】连续体积，量到嘅先至係重采样自己嗰份。

import test from 'node:test'
import assert from 'node:assert/strict'
import { Matrix4, Vector3 } from 'three'

import {
  assertRigid, bodySphere, clampPose, countRefillCells, invertRigid, isRigid, poseIsIdentity,
  poseSampleAt, resampleSolidMask, rigidCheck, safePoseBox,
} from '../src/analysis/lbm/rigidPose.ts'
import { bakePhi, buildDomain, predictDomain } from '../src/analysis/lbm/sdfBake.ts'
import { solidBodyShaderSource } from '../src/analysis/lbm/shaders.ts'
import { layout } from '../src/analysis/lbm/atlas.ts'

/* ══════════════════════════════════════════════════ 参考形状 + 重烘 */

const D = [64, 48, 48]
const NCELL = D[0] * D[1] * D[2]
const idx = (x, y, z) => x + D[0] * (y + D[1] * z)
const C = [24.5, 24.5, 24.5]           // 旋转中心（一个格心，所以 90° 旋转係精确嘅）

/** 面全部摆喺格边界（半宽 = n + 0.5）→ 格数 == 连续体积。见文件头。 */
const SHAPES = {
  box: (x, y, z) => Math.abs(x - C[0]) <= 9.5 && Math.abs(y - C[1]) <= 5.5 && Math.abs(z - C[2]) <= 3.5,
  sphere: (x, y, z) => Math.hypot(x - C[0], y - C[1], z - C[2]) <= 7.5,
  // L 形：冇任何对称性，所以轴换错 / 转错方向一定露馅
  L: (x, y, z) =>
    (Math.abs(x - C[0]) <= 10.5 && Math.abs(y - C[1]) <= 3.5 && Math.abs(z - C[2]) <= 3.5) ||
    (Math.abs(x - C[0] + 7) <= 3.5 && Math.abs(y - C[1] - 6) <= 6.5 && Math.abs(z - C[2]) <= 3.5),
}

/** 解析形状 → 烘焙姿态嘅 phi（二值 mask，同 bakePhi({trueSdf:false}) 同一约定）。 */
function bakeShape(inside) {
  const data = new Float32Array(NCELL)
  for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) for (let x = 0; x < D[0]; x++) {
    data[idx(x, y, z)] = inside(x + 0.5, y + 0.5, z + 0.5) ? -1 : 1
  }
  return { data, DX: D[0], DY: D[1], DZ: D[2], trueSdf: false, band: 1 }
}

/**
 * ★ 参考答案：喺姿态 m 【重新烘一次】★
 * 格心 → m⁻¹ → 问返个【解析】形状。呢条同 bakeShape() 喺 m = I 嗰阵逐句一样，
 * 所以两者係同一把尺，唔係两套规矩。
 */
function rebakeAt(inside, m) {
  const e = invertRigid(m).elements
  const out = new Uint8Array(NCELL)
  for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) for (let x = 0; x < D[0]; x++) {
    const px = x + 0.5, py = y + 0.5, pz = z + 0.5
    out[idx(x, y, z)] = inside(
      e[0] * px + e[4] * py + e[8] * pz + e[12],
      e[1] * px + e[5] * py + e[9] * pz + e[13],
      e[2] * px + e[6] * py + e[10] * pz + e[14],
    ) ? 1 : 0
  }
  return out
}

/** mask 嘅界面格（有异号邻居嗰啲，廿六邻域）—— 容差嘅分母。 */
function interfaceCells(mask) {
  const set = new Uint8Array(NCELL)
  let n = 0
  for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) for (let x = 0; x < D[0]; x++) {
    const i = idx(x, y, z)
    let iface = false
    for (let a = -1; a <= 1 && !iface; a++) for (let b = -1; b <= 1 && !iface; b++) for (let c = -1; c <= 1 && !iface; c++) {
      const nx = x + a, ny = y + b, nz = z + c
      if (nx < 0 || ny < 0 || nz < 0 || nx >= D[0] || ny >= D[1] || nz >= D[2]) continue
      if (mask[idx(nx, ny, nz)] !== mask[i]) iface = true
    }
    if (iface) { set[i] = 1; n++ }
  }
  return { set, count: n }
}

function compareMasks(a, b) {
  let diff = 0, inter = 0, na = 0, nb = 0
  for (let i = 0; i < NCELL; i++) {
    if (a[i]) na++
    if (b[i]) nb++
    if (a[i] && b[i]) inter++
    if (a[i] !== b[i]) diff++
  }
  return { diff, iou: (na + nb - inter) ? inter / (na + nb - inter) : 1, volA: na, volB: nb }
}

/* ══════════════════════════════════════════════════ 姿态 */

/** 精确嘅轴对齐旋转：整数元素，唔经 makeRotationAxis 嘅 cos(π/2) = 6.1e-17。 */
function exactRot(r9, about = C) {
  const R = new Matrix4().set(r9[0], r9[1], r9[2], 0, r9[3], r9[4], r9[5], 0, r9[6], r9[7], r9[8], 0, 0, 0, 0, 1)
  const T1 = new Matrix4().makeTranslation(about[0], about[1], about[2])
  const T0 = new Matrix4().makeTranslation(-about[0], -about[1], -about[2])
  return new Matrix4().multiplyMatrices(T1, R).multiply(T0)
}
const RZ90 = [0, -1, 0, 1, 0, 0, 0, 0, 1]
const RX90 = [1, 0, 0, 0, 0, -1, 0, 1, 0]
const RY90 = [0, 0, 1, 0, 1, 0, -1, 0, 0]
const RY180 = [-1, 0, 0, 0, 1, 0, 0, 0, -1]
const RZ270 = [0, 1, 0, -1, 0, 0, 0, 0, 1]

function axisRot(ax, ay, az, deg, about = C) {
  const R = new Matrix4().makeRotationAxis(new Vector3(ax, ay, az).normalize(), deg * Math.PI / 180)
  const T1 = new Matrix4().makeTranslation(about[0], about[1], about[2])
  const T0 = new Matrix4().makeTranslation(-about[0], -about[1], -about[2])
  return new Matrix4().multiplyMatrices(T1, R).multiply(T0)
}
const trans = (x, y, z) => new Matrix4().makeTranslation(x, y, z)

/* ══════════════════════════════════════════════════ ① 正交性 */

test('rigidPose/正交性：旋转 + 平移 + 镜射 收，缩放 / 切变 / 透视 掟', async (t) => {
  await t.test('刚体全部收', () => {
    for (const [tag, m] of [
      ['恒等', new Matrix4()],
      ['纯平移', trans(3.7, -2.1, 0.4)],
      ['精确 90° Z', exactRot(RZ90)],
      ['任意角', axisRot(1, 2, 3, 37)],
      ['平移 + 旋转', trans(2.37, 1.13, -0.62).multiply(axisRot(1, 2, 3, 37))],
      ['连乘十次旋转（累积浮点噪声都要照收）', (() => {
        const m = new Matrix4()
        for (let i = 0; i < 10; i++) m.multiply(axisRot(i + 1, 2 * i - 3, i * i - 5, 17 * i + 3, [0, 0, 0]))
        return m
      })()],
    ]) {
      assert.equal(isRigid(m), true, tag + ' 应该係刚体')
      assert.doesNotThrow(() => assertRigid(m), tag)
    }
  })

  await t.test('★ 镜射保距 → 收（但 det < 0 要报出去）', () => {
    const mir = new Matrix4().set(-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    const r = rigidCheck(mir)
    assert.equal(r.rigid, true, '镜射保距，SDF 度量仍然合法')
    assert.ok(r.det < 0, 'det 要係负数先报得出「零件已经係镜像」')
    assert.match(r.reason, /镜射/)
  })

  await t.test('★ 缩放一定要掟 ★', () => {
    for (const s of [1.5, 0.5, 1.01, 0.999]) {
      const m = new Matrix4().makeScale(s, s, s)
      assert.equal(isRigid(m), false, '均匀缩放 ' + s)
      assert.throws(() => assertRigid(m), /缩放/, '均匀缩放 ' + s + ' 冇掟')
    }
    // 非均匀缩放（最阴湿嗰种：睇落好似只係「拉长咗少少」）
    const m = new Matrix4().makeScale(1, 1, 1.02)
    assert.throws(() => assertRigid(m), /缩放/)
    // 旋转 × 缩放（3×3 唔係对角，唔可以靠「查对角线」嚟捉）
    const rs = axisRot(1, 1, 1, 41).clone().multiply(new Matrix4().makeScale(1.2, 1.2, 1.2))
    assert.throws(() => assertRigid(rs), /缩放/)
  })

  await t.test('★ 切变一定要掟 ★', () => {
    const sh = new Matrix4().set(1, 0.3, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
    assert.equal(isRigid(sh), false)
    assert.throws(() => assertRigid(sh), /切变|缩放/)
    // 列长全部啱啱好 1，但列之间唔垂直 —— 只查列长嘅实现会漏咗佢
    const a = new Vector3(1, 0, 0), b = new Vector3(Math.cos(0.2), Math.sin(0.2), 0), c = new Vector3(0, 0, 1)
    const sh2 = new Matrix4().set(a.x, b.x, c.x, 0, a.y, b.y, c.y, 0, a.z, b.z, c.z, 0, 0, 0, 0, 1)
    assert.equal(isRigid(sh2), false, '列长全 1 但唔垂直，一样係切变')
    assert.throws(() => assertRigid(sh2), /切变/)
  })

  await t.test('透视底行 / NaN 都要掟', () => {
    const p = new Matrix4()
    p.elements[3] = 0.01
    assert.throws(() => assertRigid(p), /底行/)
    const n = new Matrix4()
    n.elements[5] = NaN
    assert.throws(() => assertRigid(n), /NaN/)
  })

  await t.test('invertRigid 同 three 嘅通用逆一致，而且来回恒等', () => {
    for (const m of [exactRot(RZ90), axisRot(3, -1, 2, 61), trans(2.37, 1.13, -0.62).multiply(axisRot(1, 2, 3, 37))]) {
      const mine = invertRigid(m)
      const three = m.clone().invert()
      for (let i = 0; i < 16; i++) {
        assert.ok(Math.abs(mine.elements[i] - three.elements[i]) < 1e-12,
          'invertRigid[' + i + '] = ' + mine.elements[i] + ' vs three ' + three.elements[i])
      }
      const back = m.clone().multiply(mine)
      assert.equal(poseIsIdentity(back, 1e-12), true, 'm · m⁻¹ 应该係恒等')
    }
  })
})

/* ══════════════════════════════════════════════════ ② 外接球 / 合法平移盒 */

test('rigidPose/safePoseBox + clampPose：任何朝向都唔行埋墙', async (t) => {
  const phi = bakeShape(SHAPES.box)
  const dom = { DX: D[0], DY: D[1], DZ: D[2] }

  await t.test('bodySphere 真係包得住成件零件（任何朝向）', () => {
    const s = bodySphere(phi)
    assert.equal(s.solidCells, 19 * 11 * 7)
    assert.deepEqual(s.centre, [C[0], C[1], C[2]])
    // 每一个固体格嘅【最远嗰只角】都要喺球入面
    for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) for (let x = 0; x < D[0]; x++) {
      if (!(phi.data[idx(x, y, z)] < 0)) continue
      const d = Math.hypot(x + 0.5 - s.centre[0], y + 0.5 - s.centre[1], z + 0.5 - s.centre[2])
      assert.ok(d + Math.sqrt(3) / 2 <= s.radius + 1e-9, '格 ' + [x, y, z] + ' 嘅角凸咗出球外')
    }
  })

  await t.test('盒 = [margin + R, D − margin − R]，同朝向无关', () => {
    const s = bodySphere(phi)
    for (const margin of [0, 2, 5]) {
      const box = safePoseBox(dom, phi, margin)
      assert.equal(box.feasible, true)
      for (let a = 0; a < 3; a++) {
        assert.ok(Math.abs(box.min[a] - (margin + s.radius)) < 1e-9, '轴 ' + a + ' min')
        assert.ok(Math.abs(box.max[a] - ([D[0], D[1], D[2]][a] - margin - s.radius)) < 1e-9, '轴 ' + a + ' max')
      }
    }
  })

  await t.test('★ 夹完之后，任何朝向都真係唔掂墙 ★（逐格实证，唔係靠信条数）', () => {
    const box = safePoseBox(dom, phi, 2)
    const wild = [
      trans(-40, 0, 0), trans(200, 0, 0), trans(0, -100, 60),
      trans(-90, 90, -90).multiply(axisRot(1, 2, 3, 37)),
      trans(500, 500, 500).multiply(exactRot(RZ90)),
    ]
    for (const m of wild) {
      const c = clampPose(m, box)
      assert.equal(isRigid(c), true, '夹完仲要係刚体')
      // 旋转分量一个字都唔准郁
      for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
        assert.ok(Math.abs(c.elements[i] - m.elements[i]) < 1e-12, 'clampPose 唔准郁旋转分量 [' + i + ']')
      }
      const mask = resampleSolidMask(phi, invertRigid(c))
      // margin = 2 → 最外两层一定要係空嘅
      for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) for (let x = 0; x < D[0]; x++) {
        if (!mask[idx(x, y, z)]) continue
        assert.ok(x >= 2 && y >= 2 && z >= 2 && x < D[0] - 2 && y < D[1] - 2 && z < D[2] - 2,
          '夹完仲有固体格喺 margin 入面：' + [x, y, z])
      }
    }
  })

  await t.test('本来就喺盒入面 → 一个字都唔改', () => {
    const box = safePoseBox(dom, phi, 2)
    const m = exactRot(RZ90)
    const c = clampPose(m, box)
    for (let i = 0; i < 16; i++) assert.ok(Math.abs(c.elements[i] - m.elements[i]) < 1e-12, '[' + i + ']')
  })

  await t.test('域装唔落外接球 → feasible = false，唔准扮成功', () => {
    // 尺寸对唔上一定要掟（呢个係最易 copy-paste 错嘅嘢）
    assert.throws(() => safePoseBox({ DX: 12, DY: 12, DZ: 12 }, phi, 2), /唔等于域/)
    // 20³ 嘅域塞一件 15×15×15 嘅零件：外接球直径 ≈ 26 > 20，点摆都贴墙
    const S = 20
    const data = new Float32Array(S * S * S).fill(1)
    for (let z = 2; z < 17; z++) for (let y = 2; y < 17; y++) for (let x = 2; x < 17; x++) {
      data[x + S * (y + S * z)] = -1
    }
    const fat = { data, DX: S, DY: S, DZ: S, trueSdf: false, band: 1 }
    const box = safePoseBox({ DX: S, DY: S, DZ: S }, fat, 2)
    assert.equal(box.feasible, false, '外接球直径 ' + (2 * bodySphere(fat).radius).toFixed(1) + ' > 域 ' + S)
    assert.ok(box.notes.length > 0, 'feasible = false 一定要有 note 讲点解')
    for (let a = 0; a < 3; a++) assert.equal(box.min[a], box.max[a], '退化嗰阵盒应该塌成域中心一点')
  })
})

/* ══════════════════════════════════════════════════ ③ padForRotation（纯数学） */

test('sdfBake/padForRotation：预设唔准改行为；开咗要装得落任何朝向', async (t) => {
  /** 未加 padForRotation 之前嘅【原文】—— 独立参考，唔准 call 新代码。 */
  function legacyDomain(nFlow, nA, nB) {
    const crossMax = Math.max(nA, nB)
    const padUp = Math.round(0.4 * crossMax) + 4
    const padDown = Math.round(1.2 * crossMax) + 6
    const padA = Math.round(0.45 * nA) + 4
    const padB = Math.round(0.45 * nB) + 4
    return { DX: padUp + nFlow + padDown, DY: nA + 2 * padA, DZ: nB + 2 * padB, padUp, padDown, padA, padB }
  }

  const grid = (nx, ny, nz) => {
    const solid = new Uint8Array(nx * ny * nz).fill(1)
    return { h: 0.5, nx, ny, nz, ox: 1, oy: 2, oz: 3, solid }
  }

  await t.test('★ 预设 false → 逐个数同以前一样 ★', () => {
    for (const [nx, ny, nz] of [[40, 8, 8], [12, 12, 12], [7, 19, 3], [1, 1, 1], [33, 21, 5]]) {
      const d = buildDomain(grid(nx, ny, nz))
      const dims = [nx, ny, nz]
      const fa = (dims[0] >= dims[1] && dims[0] >= dims[2]) ? 0 : (dims[1] >= dims[2] ? 1 : 2)
      const ca = fa === 0 ? 1 : 0, cb = fa === 2 ? 1 : 2
      const L = legacyDomain(dims[fa], dims[ca], dims[cb])
      const tag = [nx, ny, nz].join('x')
      assert.equal(d.DX, L.DX, tag + ' DX')
      assert.equal(d.DY, L.DY, tag + ' DY')
      assert.equal(d.DZ, L.DZ, tag + ' DZ')
      assert.equal(d.padUp, L.padUp, tag + ' padUp')
      assert.equal(d.padDown, L.padDown, tag + ' padDown')
      assert.equal(d.padA, L.padA, tag + ' padA')
      assert.equal(d.padB, L.padB, tag + ' padB')
      const p = predictDomain(nx, ny, nz)
      assert.deepEqual([p.DX, p.DY, p.DZ], [L.DX, L.DY, L.DZ], tag + ' predictDomain 要同 buildDomain 一致')
      // 明写 padForRotation: false 亦要一样
      const d2 = buildDomain(grid(nx, ny, nz), { padForRotation: false })
      assert.deepEqual([d2.DX, d2.DY, d2.DZ], [d.DX, d.DY, d.DZ], tag + ' 明写 false')
    }
  })

  await t.test('★ 开咗：每轴槽位 >= 外接球直径，而且零件真係居中 ★', () => {
    for (const [nx, ny, nz] of [[40, 8, 8], [12, 12, 12], [7, 19, 3], [33, 21, 5], [2, 9, 16]]) {
      const g = grid(nx, ny, nz)
      const d = buildDomain(g, { padForRotation: true })
      const dims = [nx, ny, nz]
      const fa = (dims[0] >= dims[1] && dims[0] >= dims[2]) ? 0 : (dims[1] >= dims[2] ? 1 : 2)
      const ca = fa === 0 ? 1 : 0, cb = fa === 2 ? 1 : 2
      const nFlow = dims[fa], nA = dims[ca], nB = dims[cb]
      const dia = Math.sqrt(nFlow * nFlow + nA * nA + nB * nB)
      const tag = [nx, ny, nz].join('x')
      // 零件槽位 = 域减两边边距。★ 头尾嘅留白要 >= (dia − n) / 2，先至转得郁 ★
      const slotFlow = nFlow + 2 * Math.min(d.padUp, d.DX - d.padUp - nFlow)
      const slotA = nA + 2 * Math.min(d.padA, d.DY - d.padA - nA)
      const slotB = nB + 2 * Math.min(d.padB, d.DZ - d.padB - nB)
      assert.ok(slotFlow >= dia - 1e-9, tag + ' 流向槽位 ' + slotFlow + ' < 外接球 ' + dia.toFixed(2))
      assert.ok(slotA >= dia - 1e-9, tag + ' 横向A槽位 ' + slotA + ' < 外接球 ' + dia.toFixed(2))
      assert.ok(slotB >= dia - 1e-9, tag + ' 横向B槽位 ' + slotB + ' < 外接球 ' + dia.toFixed(2))
      // 域一定唔会细过预设嗰个
      const base = buildDomain(grid(nx, ny, nz))
      assert.ok(d.DX >= base.DX && d.DY >= base.DY && d.DZ >= base.DZ, tag + ' 开咗反而细咗？')
      const p = predictDomain(nx, ny, nz, { padForRotation: true })
      assert.deepEqual([p.DX, p.DY, p.DZ], [d.DX, d.DY, d.DZ], tag + ' predictDomain 要跟得住')
    }
  })

  await t.test('padUp + nFlow + padDown === DX（padUp 係零件原点嘅真 offset）', () => {
    for (const rot of [false, true]) for (const [nx, ny, nz] of [[40, 8, 8], [7, 19, 3], [12, 12, 12]]) {
      const d = buildDomain(grid(nx, ny, nz), { padForRotation: rot })
      const dims = [nx, ny, nz]
      const fa = (dims[0] >= dims[1] && dims[0] >= dims[2]) ? 0 : (dims[1] >= dims[2] ? 1 : 2)
      assert.equal(d.padUp + dims[fa] + d.padDown, d.DX, [nx, ny, nz] + ' rot=' + rot)
      // obst 真係摆咗喺 padUp 度（volMatrix 同迎风投影全部靠呢件事）
      const first = d.obst.findIndex((v) => v === 1)
      assert.ok(first >= 0, '一格固体都冇？')
      assert.equal(first % d.DX, d.padUp, 'obst 嘅第一格 x 唔喺 padUp')
    }
  })

  await t.test('★ 开咗之后，零件转到 90° 都仲喺域入面 ★（真去 resample 睇）', () => {
    const g = grid(24, 6, 6)
    const d = buildDomain(g, { padForRotation: true })
    const phi = bakePhi(d)
    const s = bodySphere(phi)
    const box = safePoseBox(d, phi, 1)
    assert.equal(box.feasible, true, 'padForRotation 开咗都话装唔落？')
    for (const r9 of [RZ90, RX90, RY90, RY180, RZ270]) {
      const m = exactRot(r9, s.centre)
      const mask = resampleSolidMask(phi, invertRigid(m))
      let n = 0
      for (let i = 0; i < mask.length; i++) n += mask[i]
      assert.equal(n, 24 * 6 * 6, '转 90° 之后固体格数应该一个都唔少（' + n + '）')
    }
    // 对照：唔开 padForRotation，同一件零件转 90° 会畀域切走一大橛
    const d0 = buildDomain(grid(24, 6, 6))
    const phi0 = bakePhi(d0)
    const s0 = bodySphere(phi0)
    const m0 = exactRot(RZ90, s0.centre)
    const mask0 = resampleSolidMask(phi0, invertRigid(m0))
    let n0 = 0
    for (let i = 0; i < mask0.length; i++) n0 += mask0[i]
    assert.ok(n0 < 24 * 6 * 6, '预设嘅域本来就应该装唔落转 90° 嘅长条（呢个就係 padForRotation 存在嘅理由）')
  })
})

/* ══════════════════════════════════════════════════ ④ ★ mask 一致性（最重要）★ */

test('★ rigidPose/mask 一致性：变换重采样 vs 喺该姿态重新烘 ★', async (t) => {
  /*
   * 容差点定（实测数字见每条测试嘅 console 输出）：
   *
   *  ① 【结构性】唔啱嘅格，一定要【全部】落喺重烘 mask 嘅界面上面。
   *     呢条先係硬嘢：只要有一格唔啱係喺 body 内部或者远场，就代表有鬼影 / 整体偏移 /
   *     wrap，而唔係量化噪声 —— 容差调到几大都唔应该收。实测 100% 落喺界面。
   *  ② 【量级】diff <= 0.12 × 界面格数（界面 = 廿六邻域有异号邻居嗰啲，两边都计）。
   *     实测最坏 0.058（球，因为球面成面都係擦边），盒同 L 形係 0.002 ~ 0.017。
   *     0.12 大约係实测最坏值嘅 2 倍余量。
   *  ③ 【IoU】>= 0.90。实测最坏 0.932（球）。盒 / L 形係 0.986 ~ 1.000。
   *  ④ 【精确】恒等 / 90°·180°·270° 轴对齐旋转 / 整数平移 → diff 一定要係 0，唔准有余量。
   *
   * ★ 唔喺呢度测「啱啱好半格」嘅平移 ★ —— 见下面独立嗰条：半格之下参考本身就唔定义得清，
   *   量到嘅係参考嘅 inclusive 边界，唔係重采样。
   */
  const TOL_DIFF_OVER_IFACE = 0.12
  const TOL_IOU = 0.90

  function check(shapeName, poseName, m, { exact = false, iouTol = TOL_IOU } = {}) {
    const inside = SHAPES[shapeName]
    const phi = bakeShape(inside)
    const got = resampleSolidMask(phi, invertRigid(m))
    const want = rebakeAt(inside, m)
    const { diff, iou, volA, volB } = compareMasks(got, want)
    const iface = interfaceCells(want)
    const ratio = iface.count ? diff / iface.count : 0

    // ① 结构性：唔啱嘅一定要喺界面上面
    let offIface = 0, firstOff = null
    for (let i = 0; i < NCELL; i++) {
      if (got[i] !== want[i] && !iface.set[i]) {
        offIface++
        if (!firstOff) firstOff = [i % D[0], ((i / D[0]) | 0) % D[1], (i / (D[0] * D[1])) | 0]
      }
    }
    const tag = (shapeName + '/' + poseName).padEnd(26)
    console.log('    ' + tag +
      'diff=' + String(diff).padStart(4) +
      ' iface=' + String(iface.count).padStart(4) +
      ' diff/iface=' + ratio.toFixed(4) +
      ' IoU=' + iou.toFixed(4) +
      ' vol ' + volA + ' vs ' + volB +
      ' offIface=' + offIface)

    assert.equal(offIface, 0,
      shapeName + '/' + poseName + '：有 ' + offIface + ' 格唔啱【唔喺界面】（例：' + firstOff +
      '）—— 呢个係鬼影 / 偏移 / wrap，唔係量化噪声，唔准调容差')
    if (exact) {
      assert.equal(diff, 0, shapeName + '/' + poseName + '：呢个姿态数学上係精确嘅，diff 一定要係 0，实测 ' + diff)
    } else {
      assert.ok(ratio <= TOL_DIFF_OVER_IFACE,
        shapeName + '/' + poseName + '：diff/iface = ' + ratio.toFixed(4) + ' > ' + TOL_DIFF_OVER_IFACE)
      assert.ok(iou >= iouTol, shapeName + '/' + poseName + '：IoU = ' + iou.toFixed(4) + ' < ' + iouTol)
    }
    return { diff, ratio, iou }
  }

  await t.test('★ 恒等：一格都唔准差 ★', () => {
    for (const s of Object.keys(SHAPES)) check(s, '恒等', new Matrix4(), { exact: true })
  })

  await t.test('★ 纯 90° 旋转（Z / X / Y / 180 / 270）：一格都唔准差 ★', () => {
    for (const s of Object.keys(SHAPES)) {
      check(s, '90°Z', exactRot(RZ90), { exact: true })
      check(s, '90°X', exactRot(RX90), { exact: true })
      check(s, '90°Y', exactRot(RY90), { exact: true })
      check(s, '180°Y', exactRot(RY180), { exact: true })
      check(s, '270°Z', exactRot(RZ270), { exact: true })
    }
  })

  await t.test('★ 纯平移 ★（整数 = 精确；非整数 = 容差内）', () => {
    for (const s of Object.keys(SHAPES)) {
      check(s, '平移 +3,-2,+4', trans(3, -2, 4), { exact: true })
      check(s, '平移 -5,+6,-1', trans(-5, 6, -1), { exact: true })
      check(s, '平移 2.37,1.13,-.62', trans(2.37, 1.13, -0.62))
      check(s, '平移 .25,-.75,.4', trans(0.25, -0.75, 0.4))
    }
  })

  await t.test('★ 诚实纪录：啱啱好【半格】平移係单数子取样嘅最坏情况 ★', () => {
    /*
     * 平移啱啱好 0.5 格嗰阵，目的地格心逆变换之后【啱啱落喺物件格嘅边界】上面。
     * 呢陣真正嘅覆盖率係 50 : 50，但 27 点嘅中点法则（offset −1/3, 0, +1/3）只可以分到
     * 1 : 2 —— 单数样本【冇可能】平分。即係最多偏 1/6 格。
     *
     * ★ 呢个係拣单数嘅代价，而且值得畀 ★：
     *   · 单数嘅最坏情况 = 界面偏 1/6 格（体积差 +1.9%，实测）；
     *   · 双数嘅最坏情况 = 成层面打和然后一次过唔见（体积差 −20.8%，实测，见 shaders.ts）。
     *   而且 90° / 整数平移 呢啲【真係会日日撞到】嘅姿态，单数係逐格精确嘅。
     *
     * 球係呢度最惡嘅形状（成个球面都係擦边），所以呢条淨係对球放宽 IoU 到 0.88；
     * 结构性检查（唔啱嘅格一定要喺界面上面）同 diff/iface <= 0.12 一个都冇放宽。
     */
    const r = check('sphere', '平移 .5,.5,.5', trans(0.5, 0.5, 0.5), { iouTol: 0.88 })
    assert.ok(r.ratio <= TOL_DIFF_OVER_IFACE, '就算係最坏情况，diff/iface 都唔准过 ' + TOL_DIFF_OVER_IFACE)
    // 盒 / L 形喺半格之下係【参考自己】退化（下一条），所以唔喺呢度量
  })

  await t.test('★ 诚实纪录：啱啱好半格平移之下，参考本身係 ±一整层 ★', () => {
    /*
     * 参考形状嘅面摆咗喺格边界（半宽 = n + 0.5），呢个係为咗令「格数 == 连续体积」。
     * 但咁样一平移【啱啱好半格】，两边嘅面就跌返落【格心】上面 —— 而 `<=` 係收埋嘅，
     * 所以重烘会两边各多收一整层：19×11×7 = 1463 变 20×12×8 = 1920（+31%）。
     *
     * 呢个係参考嘅退化，唔係重采样嘅错：重采样出嚟嘅体积仍然贴住烘焙体积。
     * ★ 唔准调容差去屈呢条过 ★ —— 佢根本唔係喺度量重采样。
     */
    const inside = SHAPES.box
    const phi = bakeShape(inside)
    const m = trans(0.5, 0.5, 0.5)
    const got = resampleSolidMask(phi, invertRigid(m))
    const want = rebakeAt(inside, m)
    const { volA, volB } = compareMasks(got, want)
    const baked = 19 * 11 * 7
    console.log('    半格平移：重采样 vol=' + volA + '（烘焙 ' + baked + '），重烘 vol=' + volB +
      '（= 20×12×8 = ' + (20 * 12 * 8) + '，两边各多收一层）')
    assert.equal(volB, 20 * 12 * 8, '重烘应该两边各多收一层 —— 呢个就係参考退化嘅证据')
    assert.ok(Math.abs(volA - baked) / baked < 0.05,
      '重采样嘅体积应该贴住烘焙体积（' + volA + ' vs ' + baked + '）')
  })

  await t.test('★ 任意角旋转 ★', () => {
    for (const s of Object.keys(SHAPES)) {
      check(s, '13° Z', axisRot(0, 0, 1, 13))
      check(s, '37° (1,2,3)', axisRot(1, 2, 3, 37))
      check(s, '61° (3,-1,2)', axisRot(3, -1, 2, 61))
      check(s, '7° (1,1,0)', axisRot(1, 1, 0, 7))
      check(s, '83° (0,1,1)', axisRot(0, 1, 1, 83))
    }
  })

  await t.test('★ 平移 + 旋转 复合 ★', () => {
    for (const s of Object.keys(SHAPES)) {
      check(s, '90°Z + 整数平移', trans(4, -3, 2).multiply(exactRot(RZ90)), { exact: true })
      check(s, '37° + 平移', trans(2.37, 1.13, -0.62).multiply(axisRot(1, 2, 3, 37)))
      check(s, '平移 + 61°', axisRot(3, -1, 2, 61).clone().premultiply(trans(-3.4, 2.2, 1.7)))
    }
  })

  await t.test('★ 一大堆随机刚体姿态（种子固定）★', () => {
    let seed = 20260725
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
    let worstRatio = 0, worstIou = 1, worstTag = ''
    for (let i = 0; i < 24; i++) {
      const ax = rnd() * 2 - 1, ay = rnd() * 2 - 1, az = rnd() * 2 - 1
      if (Math.hypot(ax, ay, az) < 1e-3) continue
      const deg = rnd() * 360
      const m = trans((rnd() - 0.5) * 6, (rnd() - 0.5) * 6, (rnd() - 0.5) * 6).multiply(axisRot(ax, ay, az, deg))
      const shape = ['box', 'sphere', 'L'][i % 3]
      const r = check(shape, 'rand#' + i, m)
      if (r.ratio > worstRatio) { worstRatio = r.ratio; worstTag = shape + '#' + i }
      worstIou = Math.min(worstIou, r.iou)
    }
    console.log('    ── 随机 24 个姿态：最坏 diff/iface = ' + worstRatio.toFixed(4) + '（' + worstTag +
      '），最坏 IoU = ' + worstIou.toFixed(4))
  })

  await t.test('poseSampleAt 同 resampleSolidMask 讲同一件事', () => {
    const phi = bakeShape(SHAPES.L)
    const m = axisRot(1, 2, 3, 37)
    const inv = invertRigid(m)
    const mask = resampleSolidMask(phi, inv)
    for (let k = 0; k < 400; k++) {
      const x = (k * 7919) % D[0], y = (k * 104729) % D[1], z = (k * 1299709) % D[2]
      assert.equal(poseSampleAt(phi, inv, x, y, z) < 0 ? 1 : 0, mask[idx(x, y, z)], '格 ' + [x, y, z])
    }
  })
})

/* ══════════════════════════════════════════════════ ⑤ 出界 = 流体（唔准 clamp / wrap） */

test('rigidPose/出界一定要当流体：唔准 clamp 出鬼影、唔准 wrap 生零件', async (t) => {
  await t.test('把零件推出去域外 → 域入面一格固体都唔应该剩', () => {
    const phi = bakeShape(SHAPES.box)
    for (const m of [trans(500, 0, 0), trans(0, -500, 0), trans(0, 0, 900), trans(-400, 400, -400)]) {
      const mask = resampleSolidMask(phi, invertRigid(m))
      let n = 0
      for (let i = 0; i < mask.length; i++) n += mask[i]
      assert.equal(n, 0, '零件推咗出域外，但域入面仲有 ' + n + ' 格固体 —— 即係 clamp 咗或者 wrap 咗')
    }
  })

  await t.test('推出一半 → 另一边【唔准】生返嘢出嚟（wrap 嘅招牌症状）', () => {
    const phi = bakeShape(SHAPES.box)
    // 把盒推到 −x 边界外一半：x < 0 嗰半应该消失，唔应该喺 x ≈ DX 嗰边出现
    const m = trans(-C[0] - 4, 0, 0)
    const mask = resampleSolidMask(phi, invertRigid(m))
    for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) for (let x = D[0] - 12; x < D[0]; x++) {
      assert.equal(mask[idx(x, y, z)], 0, '下游 x=' + x + ' 出现咗固体 —— wrap 咗')
    }
  })

  await t.test('紧贴 −x 边界 → 唔准沿住边界拖出一条鬼影柱（clamp 嘅招牌症状）', () => {
    const phi = bakeShape(SHAPES.box)
    // 盒左边啱啱越过 x = 0：x = 0 嗰层应该只有【原本嗰橛】咁高，唔应该成个 y-z 面都係固体
    const m = trans(-C[0] + 4.5, 0, 0)
    const mask = resampleSolidMask(phi, invertRigid(m))
    let onFace = 0
    for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) if (mask[idx(0, y, z)]) onFace++
    assert.ok(onFace <= 11 * 7, 'x=0 面上有 ' + onFace + ' 格固体，多过零件截面 ' + (11 * 7) + ' —— clamp 咗')
  })

  await t.test('outside 参数要真係用得着（真 SDF 嘅远场距离）', () => {
    const phi = { ...bakeShape(SHAPES.box), trueSdf: true, band: 4 }
    // trilinear 路径：完全喺域外嘅取样点要读到 outside，唔係 0
    const v = poseSampleAt(phi, invertRigid(trans(0, 0, 0)), -50, -50, -50, { mode: 'trilinear', outside: 4 })
    assert.equal(v, 4, '完全喺域外要读到 outside')
    const v2 = poseSampleAt(phi, invertRigid(trans(0, 0, 0)), -50, -50, -50, { mode: 'vote27', outside: 1 })
    assert.equal(v2, 1, 'vote 路径喺域外要投出流体')
  })
})

/* ══════════════════════════════════════════════════ ⑥ trilinear（真 SDF 路径） */

test('rigidPose/真 SDF 用 trilinear：旋转保距所以内插合法', async (t) => {
  /** 解析 SDF（到盒面嘅带号距离），narrow band clamp 到 ±band。 */
  function bakeSdfBox(band = 4) {
    const h = [9.5, 5.5, 3.5]
    const data = new Float32Array(NCELL)
    for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) for (let x = 0; x < D[0]; x++) {
      const p = [x + 0.5 - C[0], y + 0.5 - C[1], z + 0.5 - C[2]]
      const q = [Math.abs(p[0]) - h[0], Math.abs(p[1]) - h[1], Math.abs(p[2]) - h[2]]
      const out = Math.hypot(Math.max(q[0], 0), Math.max(q[1], 0), Math.max(q[2], 0))
      const ins = Math.min(Math.max(q[0], Math.max(q[1], q[2])), 0)
      data[idx(x, y, z)] = Math.max(-band, Math.min(band, out + ins))
    }
    return { data, DX: D[0], DY: D[1], DZ: D[2], trueSdf: true, band }
  }

  await t.test('缺省模式跟 trueSdf 走', () => {
    const sdf = bakeSdfBox()
    const bin = bakeShape(SHAPES.box)
    // 二值 mask 用 vote27（值一定係 ±1），真 SDF 用 trilinear（会畀出小数）
    const invI = invertRigid(new Matrix4())
    assert.ok([1, -1].includes(poseSampleAt(bin, invI, 24, 24, 24)))
    const v = poseSampleAt(sdf, invertRigid(trans(0.5, 0, 0)), 24, 24, 24)
    assert.ok(Number.isFinite(v))
  })

  await t.test('恒等（用重采样路径）嘅 trilinear 要还返原值', () => {
    const sdf = bakeSdfBox()
    const invI = invertRigid(new Matrix4())
    for (let k = 0; k < 300; k++) {
      const x = (k * 7919) % D[0], y = (k * 104729) % D[1], z = (k * 1299709) % D[2]
      const got = poseSampleAt(sdf, invI, x, y, z, { mode: 'trilinear' })
      assert.ok(Math.abs(got - sdf.data[idx(x, y, z)]) < 1e-9, '格 ' + [x, y, z] + '：' + got)
    }
  })

  await t.test('★ 旋转之后 sign(phi) 仍然对得住重烘（trilinear 唔准移动条壁）★', () => {
    const sdf = bakeSdfBox()
    const inside = SHAPES.box
    for (const [pn, m] of [['90°Z', exactRot(RZ90)], ['37°(1,2,3)', axisRot(1, 2, 3, 37)],
      ['61°+t', trans(2.37, 1.13, -0.62).multiply(axisRot(3, -1, 2, 61))]]) {
      const inv = invertRigid(m)
      const want = rebakeAt(inside, m)
      const got = new Uint8Array(NCELL)
      for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) for (let x = 0; x < D[0]; x++) {
        got[idx(x, y, z)] = poseSampleAt(sdf, inv, x, y, z, { mode: 'trilinear', outside: 4 }) < 0 ? 1 : 0
      }
      const { diff, iou } = compareMasks(got, want)
      const iface = interfaceCells(want)
      console.log('    trilinear/' + pn.padEnd(14) + 'diff=' + String(diff).padStart(4) +
        ' iface=' + String(iface.count).padStart(4) + ' diff/iface=' + (diff / iface.count).toFixed(4) +
        ' IoU=' + iou.toFixed(4))
      assert.ok(diff / iface.count <= 0.12, 'trilinear/' + pn + ' diff/iface = ' + (diff / iface.count).toFixed(4))
      assert.ok(iou >= 0.90, 'trilinear/' + pn + ' IoU = ' + iou.toFixed(4))
    }
  })

  await t.test('band 之内嘅距离喺旋转之下唔准变形（旋转保距）', () => {
    const sdf = bakeSdfBox()
    const m = axisRot(1, 2, 3, 37)
    const inv = invertRigid(m)
    let maxAbs = 0
    for (let z = 6; z < D[2] - 6; z += 3) for (let y = 6; y < D[1] - 6; y += 3) for (let x = 6; x < D[0] - 6; x += 3) {
      const v = poseSampleAt(sdf, inv, x, y, z, { mode: 'trilinear', outside: 4 })
      maxAbs = Math.max(maxAbs, Math.abs(v))
    }
    assert.ok(maxAbs <= 4 + 1e-9, '内插出咗 band 以外嘅值 ' + maxAbs + ' —— 内插係凸组合，冇可能超出输入范围')
  })
})

/* ══════════════════════════════════════════════════ ⑦ refill 计数 */

test('rigidPose/countRefillCells：局部扫描要同全域暴力算一模一样', async (t) => {
  /** 全域暴力：唔慳时间，只求啱。 */
  function bruteRefill(phi, mPrev, mNow) {
    const a = resampleSolidMask(phi, invertRigid(mPrev))
    const b = resampleSolidMask(phi, invertRigid(mNow))
    let refill = 0, newSolid = 0
    for (let i = 0; i < a.length; i++) {
      if (a[i] && !b[i]) refill++
      else if (!a[i] && b[i]) newSolid++
    }
    return { refill, newSolid }
  }

  await t.test('★ 局部扫描 == 全域暴力（各种姿态）★', () => {
    for (const sn of Object.keys(SHAPES)) {
      const phi = bakeShape(SHAPES[sn])
      const s = bodySphere(phi)
      const cases = [
        ['恒等 → 恒等', new Matrix4(), new Matrix4()],
        ['恒等 → 平移1格', new Matrix4(), trans(1, 0, 0)],
        ['恒等 → 平移 3.4', new Matrix4(), trans(3.4, -1.2, 0.8)],
        ['恒等 → 90°Z', new Matrix4(), exactRot(RZ90)],
        ['13° → 37°', axisRot(0, 0, 1, 13), axisRot(1, 2, 3, 37)],
        ['远走高飞（唔重叠）', trans(-12, 0, 0), trans(12, 0, 0)],
        ['推咗出域外', new Matrix4(), trans(500, 0, 0)],
      ]
      for (const [tag, a, b] of cases) {
        const fast = countRefillCells(phi, a, b, s)
        const slow = bruteRefill(phi, a, b)
        assert.equal(fast.refill, slow.refill, sn + '/' + tag + ' refill')
        assert.equal(fast.newSolid, slow.newSolid, sn + '/' + tag + ' newSolid')
        assert.ok(fast.scanned <= NCELL, '扫多过成个域？')
      }
    }
  })

  await t.test('恒等 → 恒等：refill 一定係 0', () => {
    const phi = bakeShape(SHAPES.box)
    const r = countRefillCells(phi, new Matrix4(), new Matrix4(), bodySphere(phi))
    assert.equal(r.refill, 0)
    assert.equal(r.newSolid, 0)
  })

  await t.test('数得啱：平移一格 = 一层面咁多格 refill', () => {
    const phi = bakeShape(SHAPES.box)         // 19 × 11 × 7
    const r = countRefillCells(phi, new Matrix4(), trans(1, 0, 0), bodySphere(phi))
    assert.equal(r.refill, 11 * 7, '沿 x 推一格，尾嗰一层 11×7 应该露返出嚟')
    assert.equal(r.newSolid, 11 * 7, '头嗰一层应该新变固体')
  })

  await t.test('两个姿态完全唔重叠 → refill == 旧姿态嘅全部固体格', () => {
    const phi = bakeShape(SHAPES.box)
    const r = countRefillCells(phi, trans(-14, 0, 0), trans(14, 0, 0), bodySphere(phi))
    assert.equal(r.refill, 19 * 11 * 7)
    assert.equal(r.newSolid, 19 * 11 * 7)
  })

  await t.test('局部扫描真係慳到嘢（唔係全扫扮局部）', () => {
    const phi = bakeShape(SHAPES.box)
    const r = countRefillCells(phi, new Matrix4(), trans(1, 0, 0), bodySphere(phi))
    assert.ok(r.scanned < NCELL * 0.25,
      '扫咗 ' + r.scanned + ' / ' + NCELL + ' 格 —— 局部扫描应该细好多，否则拖拽会卡')
  })
})

/* ══════════════════════════════════════════════════ ⑧ 连续 N 个姿态（keepFlow 嘅几何前提） */

test('rigidPose/连续拖拽：N 个姿态之后几何唔准崩', async (t) => {
  await t.test('80 步拖拽 + 旋转：体积稳定、refill 有界、永远唔掂 margin', () => {
    const phi = bakeShape(SHAPES.L)
    const s = bodySphere(phi)
    const dom = { DX: D[0], DY: D[1], DZ: D[2] }
    const box = safePoseBox(dom, phi, 2)
    let prev = new Matrix4()
    let vol0 = 0
    let maxRefill = 0, totalRefill = 0
    let minVol = Infinity, maxVol = 0
    for (let k = 0; k < 80; k++) {
      const th = k * 0.13
      const raw = trans(6 * Math.sin(th), 4 * Math.cos(th * 0.7), 3 * Math.sin(th * 1.3))
        .multiply(axisRot(Math.sin(th), Math.cos(th * 0.5), 0.3, k * 4.5, s.centre))
      const m = clampPose(raw, box)
      assert.equal(isRigid(m), true, '第 ' + k + ' 步唔再係刚体')
      const rc = countRefillCells(phi, prev, m, s)
      maxRefill = Math.max(maxRefill, rc.refill)
      totalRefill += rc.refill
      const mask = resampleSolidMask(phi, invertRigid(m))
      let n = 0
      for (let i = 0; i < mask.length; i++) n += mask[i]
      if (k === 0) vol0 = n
      minVol = Math.min(minVol, n); maxVol = Math.max(maxVol, n)
      // margin = 2 → 最外两层永远唔准有固体（否则 bounce-back 会同入口 / 墙撞埋一齐）
      for (let z = 0; z < D[2]; z++) for (let y = 0; y < D[1]; y++) for (let x = 0; x < D[0]; x++) {
        if (!mask[idx(x, y, z)]) continue
        assert.ok(x >= 2 && y >= 2 && z >= 2 && x < D[0] - 2 && y < D[1] - 2 && z < D[2] - 2,
          '第 ' + k + ' 步有固体格踩咗入 margin：' + [x, y, z])
      }
      prev = m
    }
    const base = 1470
    console.log('    80 步：体积 ' + minVol + ' ~ ' + maxVol + '（烘焙 ' + base + '），' +
      'refill 最大 ' + maxRefill + '、合共 ' + totalRefill)
    assert.ok(minVol > base * 0.9 && maxVol < base * 1.1,
      '体积飘咗去 ' + minVol + '~' + maxVol + '（烘焙 ' + base + '）—— 重采样漏体积 / 谷肥咗')
    assert.ok(vol0 > 0)
    assert.ok(maxRefill <= base, 'refill 数目冇可能多过成件零件')
  })
})

/* ══════════════════════════════════════════════════ ⑨ GLSL ↔ CPU 镜像（结构性） */

test('shaders/solidBody GLSL 要同 rigidPose.ts 嘅 CPU 镜像讲同一件事', async (t) => {
  const src = solidBodyShaderSource(layout(16, 8, 8))

  await t.test('★ uPoseOn == 0 一定要行返定点 texelFetch ★（唔可以静静鸡改咗预设路径）', () => {
    assert.match(src, /uPoseOn == 0.*texelFetch\(uPhi, c, 0\)/,
      'uPoseOn = 0 嘅路径一定要係原本嗰句 texelFetch(uPhi, c, 0)')
  })

  await t.test('27 个子取样（单数 → 冇得打和）', () => {
    assert.match(src, /k < 27/, '子取样数一定要係 27（3×3×3，单数）')
    assert.match(src, /phiVote27/)
    assert.doesNotMatch(src, /k < 8;/, '2×2×2 会打和，实测会成层面咁食走（−20% 体积）')
  })

  await t.test('★ floor 之后先转 ivec3 ★（唔係嘅话 −x 边界会镜返一层零件）', () => {
    assert.match(src, /ivec3\(floor\(q\)\)/, 'ivec3(q) 会向零截断，−0.3 变 0')
  })

  await t.test('★ 出界 = 流体，唔准 clamp / wrap ★', () => {
    assert.match(src, /return uPhiOutside;/, 'phiFetch 出界要还 uPhiOutside')
    // phiFetch 入面唔准出现 clamp（volume pass 嗰个 clamp 係另一回事，唔喺呢个 shader）
    const fn = src.slice(src.indexOf('float phiFetch'), src.indexOf('float phiVote27'))
    assert.doesNotMatch(fn, /clamp\(/, 'phiFetch 用 clamp 会沿住域边拖出鬼影柱')
    assert.doesNotMatch(fn, /%/, 'phiFetch 用 % 会 wrap，零件会喺对面墙生返出嚟')
  })

  await t.test('trilinear 唔靠 sampler 嘅 LINEAR（R32F 冇 OES_texture_float_linear 会静静鸡还 0）', () => {
    assert.match(src, /float phiTrilinear/)
    // 成个 shader 一次 texture() 都唔准有：全部经 texelFetch
    assert.doesNotMatch(src, /[^l]texture\(/, 'uPhi 唔准用 texture() 抽样')
    assert.equal((src.match(/mix\(/g) || []).length, 7, 'trilinear 应该係 7 次 mix')
  })

  await t.test('零件之间嘅 union 仍然係 min-combine', () => {
    assert.match(src, /min\(phiNow, prev\)/)
  })

  await t.test('CPU 镜像同 GLSL 用同一组子取样 offset', () => {
    // GLSL：vec3(k%3, (k/3)%3, k/9) / 3.0 - 1.0/3.0   →  {−1/3, 0, +1/3}
    assert.match(src, /\/ 3\.0 - \(1\.0 \/ 3\.0\)/)
    const offs = []
    for (let k = 0; k < 27; k++) offs.push([(k % 3) / 3 - 1 / 3, (((k / 3) | 0) % 3) / 3 - 1 / 3, ((k / 9) | 0) / 3 - 1 / 3])
    assert.equal(offs.length, 27)
    for (const o of offs) for (const v of o) assert.ok(Math.abs(v) <= 1 / 3 + 1e-12, 'offset 出咗格外：' + v)
    assert.equal(new Set(offs.map((o) => o.join(','))).size, 27, '27 个 offset 唔准有重复')
  })
})
