// RETEST20 #1：關節可見把手（JointGizmo 橙色旋轉環 / 青色滑動軸＋箭頭）真滑鼠拖動。
//
// 根因（真瀏覽器 Playwright 重現，scripts/e2e-joint-drag.mjs）：用戶睇到同拖嘅「環 / 箭頭」係 JointGizmo 畫嘅
// 橙色 ±180° 環同青色 ±60 滑動軸 —— 純顯示（冇事件）。真正可拖嘅 drei PivotControls 只係子件中心一條細 1/4 弧，
// 通常唔喺用戶撳嘅位置 → pointerdown 落咗 canvas，OrbitControls 開始轉鏡頭，關節值 0。
// 解法：JointGizmo 嘅環／滑動軸本身就係把手。Viewport 外層 pointerdown capture（喺 canvas 上嘅 Orbit 之前）
// 先問 claimJointHandle：螢幕距離 ≤ 容差就開一個拖動 session（stopPropagation → Orbit/R3F 完全收唔到），
// 之後 window pointermove/up 驅動：環 = 滑鼠射線交關節平面嘅極角差（u/v 基同 kinematics/JointGizmo 一致），
// 滑動 = 射線同關節軸最近點參數差。純函數 + 細 registry（唔 import store / React）。
import { Vector3, type Ray } from 'three'

type V3 = [number, number, number]
export type JointLike = {
  id: string; type: string; anchor: V3; axis: V3; angle?: number; slide?: number
  aMin?: number; aMax?: number; sMin?: number; sMax?: number; flip?: boolean; axis2?: V3
}

const ROT = new Set(['revolute', 'cylindrical', 'ball', 'pinslot', 'screw'])
const SLD = new Set(['slider', 'cylindrical', 'pinslot', 'planar'])
const DEG = Math.PI / 180
export const JOINT_RING_R = 30

/** 同 JointGizmo / kinematics 一致嘅基：ax（flip 反向）、u = ax×ref、v = ax×u。 */
export function jointBasis(j: JointLike): { a: Vector3; ax: Vector3; u: Vector3; v: Vector3 } {
  const a = new Vector3(...j.anchor)
  const ax = new Vector3(...j.axis); if (ax.lengthSq() < 1e-9) ax.set(0, 1, 0); ax.normalize()
  if (j.flip) ax.multiplyScalar(-1)
  const ref = Math.abs(ax.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const u = new Vector3().crossVectors(ax, ref).normalize()
  const v = new Vector3().crossVectors(ax, u).normalize()
  return { a, ax, u, v }
}

/** 滑動方向（同 JointGizmo）：planar = u；pinslot = axis2 ‖ u；其餘 = 軸。 */
export function jointSlideDir(j: JointLike): Vector3 {
  const { ax, u } = jointBasis(j)
  if (j.type === 'planar') return u.clone()
  if (j.type === 'pinslot') return j.axis2 ? new Vector3(...j.axis2).normalize() : u.clone()
  return ax.clone()
}

/** 環嘅世界點（同 JointGizmo rot-arc 一樣：限位 lo..hi，螺旋多圈 = 外擴螺旋）。 */
export function jointRingPoints(j: JointLike): Vector3[] {
  const { a, u, v } = jointBasis(j)
  const isScrew = j.type === 'screw'
  const lo = (j.aMin ?? (isScrew ? -1080 : -180)) * DEG, hi = (j.aMax ?? (isScrew ? 1080 : 180)) * DEG
  const span = Math.abs(hi - lo), multi = span > 2 * Math.PI + 1e-6
  const N = multi ? Math.min(288, Math.max(48, Math.round((span / (2 * Math.PI)) * 64))) : 48
  const out: Vector3[] = []
  for (let i = 0; i <= N; i++) {
    const f = i / N, t = lo + (hi - lo) * f, r = multi ? 12 + (JOINT_RING_R - 12) * f : JOINT_RING_R
    out.push(a.clone().addScaledVector(u, r * Math.cos(t)).addScaledVector(v, r * Math.sin(t)))
  }
  return out
}

/** 滑動軸世界端點（同 JointGizmo sld-seg：sMin..sMax，缺省 ±60）。 */
export function jointSlideSegment(j: JointLike): [Vector3, Vector3] {
  const { a } = jointBasis(j), d = jointSlideDir(j)
  return [a.clone().addScaledVector(d, j.sMin ?? -60), a.clone().addScaledVector(d, j.sMax ?? 60)]
}

/** 點到 2D 線段距離（px）。 */
export function segDist2D(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy
  const t = L > 1e-12 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

export type Project = (p: Vector3) => [number, number] | null
/** 螢幕命中：環（旋轉類）或滑動軸＋兩端箭頭（滑動類）喺 tolPx 內。兩樣都中 → 揀近啲嗰樣。 */
export function jointHandleHit(j: JointLike, project: Project, x: number, y: number, tolPx = 8): 'rotate' | 'slide' | null {
  let best: { k: 'rotate' | 'slide'; d: number } | null = null
  const poly = (pts: Vector3[], k: 'rotate' | 'slide', tol: number) => {
    let prev: [number, number] | null = null
    for (const p of pts) {
      const s = project(p)
      if (s && prev) { const d = segDist2D(x, y, prev[0], prev[1], s[0], s[1]); if (d <= tol && (!best || d < best.d)) best = { k, d } }
      prev = s
    }
  }
  if (ROT.has(j.type)) poly(jointRingPoints(j), 'rotate', tolPx)
  if (SLD.has(j.type)) { const [p0, p1] = jointSlideSegment(j); poly([p0, p1], 'slide', tolPx + 2) }   // 箭頭錐 ≈ 端點，加 2px
  return best ? (best as { k: 'rotate' | 'slide' }).k : null
}

/** 射線交關節平面嘅極角（rad，u/v 基）；射線差唔多平行平面 → null。 */
export function rayPolarAngle(j: JointLike, ray: Ray): number | null {
  const { a, ax, u, v } = jointBasis(j)
  const den = ray.direction.dot(ax)
  if (Math.abs(den) < 1e-4) return null
  const t = a.clone().sub(ray.origin).dot(ax) / den
  const p = ray.origin.clone().addScaledVector(ray.direction, t).sub(a)
  return Math.atan2(p.dot(v), p.dot(u))
}

/** 射線同滑動軸最近點喺軸上嘅參數（mm）；平行 → null。 */
export function rayAxisParam(j: JointLike, ray: Ray): number | null {
  const { a } = jointBasis(j), d = jointSlideDir(j)
  const w0 = a.clone().sub(ray.origin), b = d.dot(ray.direction), dd = 1 - b * b
  if (dd < 1e-6) return null
  return (b * ray.direction.dot(w0) - d.dot(w0)) / dd
}

const wrapPi = (x: number) => { let y = (x + Math.PI) % (2 * Math.PI); if (y < 0) y += 2 * Math.PI; return y - Math.PI }

export type JointDragSession = { kind: 'rotate' | 'slide'; move: (ray: Ray) => void; end: () => void }
/** 開一個拖動 session：apply(patch) 寫關節值；角度逐幀 unwrap 累加（可轉多圈）。 */
export function startJointHandleDrag(j: JointLike, kind: 'rotate' | 'slide', ray0: Ray, apply: (patch: { angle?: number; slide?: number }) => void, end: () => void): JointDragSession | null {
  if (kind === 'rotate') {
    let last = rayPolarAngle(j, ray0)
    if (last == null) return null
    let ang = j.angle ?? 0
    return {
      kind,
      move: (ray) => { const now = rayPolarAngle(j, ray); if (now == null || last == null) return; ang += wrapPi(now - last) / DEG; last = now; apply({ angle: Math.round(ang * 1000) / 1000 }) },
      end,
    }
  }
  const t0 = rayAxisParam(j, ray0)
  if (t0 == null) return null
  const s0 = j.slide ?? 0
  return {
    kind,
    move: (ray) => { const t = rayAxisParam(j, ray); if (t == null) return; apply({ slide: Math.round((s0 + t - t0) * 1000) / 1000 }) },
    end,
  }
}

// ── registry：JointGizmo（Canvas 內，有相機）註冊；Viewport 外層 capture 問 ──
type Ctl = { enabled: boolean } | null | undefined
type Claimer = (clientX: number, clientY: number) => { move: (x: number, y: number) => void; end: () => void; controls?: Ctl } | null
const _claimers = new Map<string, Claimer>()
export function registerJointHandleClaimer(key: string, c: Claimer | null): void { if (c) _claimers.set(key, c); else _claimers.delete(key) }

/**
 * Viewport onPointerDownCapture：撳中關節把手 → 回傳 true（呼叫者要 stopPropagation，Orbit/R3F 收唔到），
 * 停 Orbit、window capture 聽 move/up 驅動，放手還原。
 */
export function claimJointHandle(clientX: number, clientY: number, win: Pick<Window, 'addEventListener' | 'removeEventListener'> | null = typeof window !== 'undefined' ? window : null): boolean {
  for (const c of _claimers.values()) {
    let s: ReturnType<Claimer> = null
    try { s = c(clientX, clientY) } catch { s = null }
    if (!s) continue
    const ctl = s.controls; const was = ctl?.enabled
    if (ctl) ctl.enabled = false
    if (win) {
      const mv = (e: Event) => { const p = e as PointerEvent; s!.move(p.clientX, p.clientY) }
      // 放手後瀏覽器仲會派一個 click 落 canvas → R3F 會當咗「點選組件」；食咗佢（只呢一下）。
      const swallow = (e: Event) => { e.stopPropagation(); e.preventDefault?.() }
      const up = () => {
        win.removeEventListener('pointermove', mv, true); win.removeEventListener('pointerup', up, true); win.removeEventListener('pointercancel', up, true)
        if (ctl && was != null) ctl.enabled = was
        win.addEventListener('click', swallow, true)
        setTimeout(() => win.removeEventListener('click', swallow, true), 0)
        s!.end()
      }
      win.addEventListener('pointermove', mv, true)
      win.addEventListener('pointerup', up, true)
      win.addEventListener('pointercancel', up, true)
    }
    return true
  }
  return false
}
