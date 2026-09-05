// sweepTwist.ts — 沿任意 spine 的【twist 扭转 + taper 缩放】扫掠（解锁 replicad GenericSweepConfig
// 封死嘅 path-twist / 末端 scale 两个 Fusion 缺口）。现有内核已绑 BRepOffsetAPI_MakePipeShell 全部方法
// （SetMode/Add_1/SetLaw_1/MakeSolid）—— 无需重建内核（tests/kernel-frame-twist.mjs 已实证直/弧 spine 体积精确）。
//
// 做法：BRepAdaptor_CompCurve 按弧长采样 spine，用【旋转最小化 frame（parallel transport，无翻转）】沿路逐站
// 摆放截面副本，每站绕局部切向额外转 twist·s、按 lerp(1,scaleEnd,s) 缩放，再 MakePipeShell.Add_1 多 section 缝成实体。
// （Add_2 定位 vertex 要求系 spine 自身嘅 vertex，散点 vertex 会抛 → 必须用 Add_1 location-free，OCCT 按最近
// spine 参数自动 seat —— tests/kernel-twist-diag.mjs V1-V4 实证。）
//
// 纯模块（除 replicad 基元 + 传入嘅 oc 句柄外无副作用），可 Node 离线测：tests/sweeptwist.test.mjs。
import { Plane as RPlane, cast, GCWithScope } from 'replicad'

type V3 = [number, number, number]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => { const L = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / L, a[1] / L, a[2] / L] }
// Rodrigues：向量 v 绕单位轴 k 转 th
const rot = (v: V3, k: V3, th: number): V3 => { const c = Math.cos(th), s = Math.sin(th); return add(add(scl(v, c), scl(cross(k, v), s)), scl(k, dot(k, v) * (1 - c))) }

export interface TwistTaperOpts {
  twistDeg?: number      // 沿路总扭转角（度），正=逆时针绕切向
  scaleEnd?: number      // 末端截面相对起端的缩放（1=不变；0.5=收一半；>1=放大）
  stations?: number      // 采样站数（不传则按扭转角自动定，每 ~15° 一站，最少 2）
}

// spineWireWrapped: TopoDS_Wire（replicad wire 的 .wrapped）
// makeProfileWireOnPlane(plane): 在给定 RPlane 上建截面 → 返回 replicad Wire（取其 .wrapped）。
// 返回 replicad 形状（cast 结果）；失败抛错（调用方 try/catch 退回普通扫掠）。
export function frameTwistTaperSweep(
  oc: any,
  spineWireWrapped: any,
  makeProfileWireOnPlane: (plane: any) => any,
  opts: TwistTaperOpts,
  guideWireWrapped?: any,         // 可选导轨 wire（.wrapped）：每站把截面 x 轴朝向导轨点（投影⊥切向），twist 叠加其上 —— 实现 twist+导轨同用
): any {
  const r = GCWithScope()
  const twistDeg = opts.twistDeg || 0
  const scaleEnd = (opts.scaleEnd == null || !Number.isFinite(opts.scaleEnd)) ? 1 : opts.scaleEnd
  const cc = r(new oc.BRepAdaptor_CompCurve_2(spineWireWrapped, true)) // curvilinear abscissa → U = 弧长
  const u0 = cc.FirstParameter(), u1 = cc.LastParameter(), len = u1 - u0
  // 退化守卫：零/极短弧长路径 → ds = 1e-4/len = Infinity → 切向/取点全 NaN → 破壳。抛错俾调用方 try/catch 退回普通扫掠（gotcha e）。
  if (!(len > 1e-6) || !Number.isFinite(len)) throw new Error('frameTwistTaperSweep: spine 弧长太短/退化（len=' + len + '）')
  const pAt = (s: number): V3 => { const p = cc.Value(u0 + len * Math.min(1, Math.max(0, s))); return [p.X(), p.Y(), p.Z()] }
  const ds = Math.max(1e-4, len * 1e-3) / len
  const tAt = (s: number): V3 => norm(sub(pAt(Math.min(1, s + ds)), pAt(Math.max(0, s - ds))))

  // 导轨采样（弧长比例 s 对齐 spine）。退化/缺省 → gAt=null → 退回旋转最小化 frame。
  let gAt: ((s: number) => V3) | null = null
  if (guideWireWrapped) {
    const gcc = r(new oc.BRepAdaptor_CompCurve_2(guideWireWrapped, true))
    const g0 = gcc.FirstParameter(), gLen = gcc.LastParameter() - g0
    if (gLen > 1e-6 && Number.isFinite(gLen)) {
      gAt = (s: number): V3 => { const p = gcc.Value(g0 + gLen * Math.min(1, Math.max(0, s))); return [p.X(), p.Y(), p.Z()] }
    }
  }
  // 站数：扭转每 ~15° 一站；缩放至少端到端；封顶防爆
  const N = Math.max(2, Math.min(200, opts.stations || Math.ceil(Math.max(2, Math.abs(twistDeg) / 15))))

  const b = r(new oc.BRepOffsetAPI_MakePipeShell(spineWireWrapped))
  b.SetMode_1(true) // Frenet 基础朝向（截面间表面构造），twist 系喺此之上叠加嘅 section 旋转

  let Tprev = tAt(0)
  const refAxis: V3 = Math.abs(Tprev[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  // 起端面内 x 轴 = ref × 切向 —— 同 worker makeTube3/guidedTube 既有约定一致，令 twist=0 时截面朝向与普通扫掠逐一对应（唔会无端转 90°）
  let Nprev = norm(cross(refAxis, Tprev))

  for (let i = 0; i <= N; i++) {
    const s = i / N
    const Ti = i === 0 ? Tprev : tAt(s)
    if (i > 0) { // parallel transport：把上一站法向绕 (Tprev×Ti) 转过两切向夹角 → 旋转最小化 frame（无突跳）
      const ax = cross(Tprev, Ti), sinA = Math.hypot(ax[0], ax[1], ax[2])
      if (sinA > 1e-9) Nprev = norm(rot(Nprev, norm(ax), Math.atan2(sinA, dot(Tprev, Ti))))
    }
    Tprev = Ti
    const P = pAt(s)
    // 基准面内 x 轴：有导轨 → 朝向导轨点（投影⊥切向）；否则用旋转最小化 frame（parallel transport）。twist 叠加其上。
    let base = Nprev
    if (gAt) {
      const dir = sub(gAt(s), P)
      const ip = sub(dir, scl(Ti, dot(dir, Ti)))         // 去掉沿切向分量 → 落喺截面平面
      const L = Math.hypot(ip[0], ip[1], ip[2])
      if (L > 1e-6) base = norm(ip)                       // 导轨退化（落喺切向上）→ 退回 Nprev
    }
    const tw = (twistDeg * Math.PI / 180) * s
    const Bi = cross(Ti, base)
    const xDir = norm(add(scl(base, Math.cos(tw)), scl(Bi, Math.sin(tw)))) // 面内 x 轴绕切向转 twist·s
    const pl = new RPlane(P, xDir as any, Ti as any) // origin, xDir, normal=切向
    let w = makeProfileWireOnPlane(pl).wrapped // TopoDS_Wire on station plane
    const sc = 1 + (scaleEnd - 1) * s
    if (Math.abs(sc - 1) > 1e-9) { // 绕站点等比缩放该截面（taper）
      const trsf = r(new oc.gp_Trsf_1())
      trsf.SetScale(r(new oc.gp_Pnt_3(P[0], P[1], P[2])), sc)
      w = oc.TopoDS.Wire_1(r(new oc.BRepBuilderAPI_Transform_2(w, trsf, true)).Shape())
    }
    b.Add_1(w, false, false)
  }
  b.Build(r(new oc.Message_ProgressRange_1()))
  b.MakeSolid()
  return cast(b.Shape())
}
