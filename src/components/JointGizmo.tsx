import { type ReactNode } from 'react'
import { Line } from '@react-three/drei'
import { Vector3, Quaternion } from 'three'
import { type Joint, type JointOrigin, resolveJointOrigin } from '../assembly/kinematics'

// GM-3DV4 A1：可复用 Joint Origin 在场景中的标记 — 十字准星球（Fusion「Joint Origins」帧）+ 沿轴短箭。
export function JointOriginView({ jo }: { jo: JointOrigin }) {
  const { anchor, axis } = resolveJointOrigin(jo)
  const a = new Vector3(anchor[0], anchor[1], anchor[2])
  const ax = new Vector3(axis[0], axis[1], axis[2]); if (ax.lengthSq() < 1e-9) ax.set(0, 0, 1); ax.normalize()
  const C = '#12b886'   // 青绿 — 区别于关节橙(转)/青(滑)
  const L = 10
  const tip = a.clone().addScaledVector(ax, L)
  const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), ax)
  const ref = Math.abs(ax.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const u = new Vector3().crossVectors(ax, ref).normalize()
  const v = new Vector3().crossVectors(ax, u).normalize()
  return (
    <group>
      <mesh position={a} renderOrder={997}>
        <sphereGeometry args={[2.2, 16, 16]} />
        <meshBasicMaterial color={C} depthTest={false} />
      </mesh>
      {/* 十字准星（面内 u/v）+ 轴向短箭 */}
      <Line points={[a.clone().addScaledVector(u, -6), a.clone().addScaledVector(u, 6)]} color={C} lineWidth={1.5} depthTest={false} renderOrder={997} />
      <Line points={[a.clone().addScaledVector(v, -6), a.clone().addScaledVector(v, 6)]} color={C} lineWidth={1.5} depthTest={false} renderOrder={997} />
      <Line points={[a, tip]} color={C} lineWidth={2} depthTest={false} renderOrder={997} />
      <mesh position={tip} quaternion={q} renderOrder={997}>
        <coneGeometry args={[1.8, 5, 10]} />
        <meshBasicMaterial color={C} depthTest={false} />
      </mesh>
    </group>
  )
}

// In-viewport joint manipulator + limits visualization.
// anchor/axis are already in three.js world coords (see kinematics.ts) and this
// component renders inside a NON-rotated group, so they're used directly — NO swizzle.
//
// The orthonormal basis (ref/u/v) and the angle clamp MUST match kinematics.ts
// jointMotion()/clampA() exactly so the gizmo is an honest mirror of the FK:
//   ref = |ax.x|<0.9 ? X : Y ;  u = cross(ax,ref) ;  v = cross(ax,u)

const ROT_TYPES = new Set<Joint['type']>(['revolute', 'cylindrical', 'ball', 'pinslot', 'screw'])
const SLD_TYPES = new Set<Joint['type']>(['slider', 'cylindrical', 'pinslot', 'planar'])

const ROT_COLOR = '#ff8c00'
const SLD_COLOR = '#00b6d4'
const RIGID_COLOR = '#9aa3ab'

const DEG = Math.PI / 180

export function JointGizmo({ j }: { j: Joint }) {
  // anchor & axis straight from world coords — no swizzle.
  const a = new Vector3(j.anchor[0], j.anchor[1], j.anchor[2])
  const ax = new Vector3(j.axis[0], j.axis[1], j.axis[2])
  if (ax.lengthSq() < 1e-9) ax.set(0, 1, 0)
  ax.normalize()
  if (j.flip) ax.multiplyScalar(-1)   // GM-3DV4 A2：Flip 反转轴向 → gizmo 同 FK 保持一致镜像

  // Orthonormal basis — must match kinematics convention exactly.
  const ref = Math.abs(ax.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const u = new Vector3().crossVectors(ax, ref).normalize()
  const v = new Vector3().crossVectors(ax, u).normalize()

  const isRot = ROT_TYPES.has(j.type)
  const isSld = SLD_TYPES.has(j.type)

  const els: ReactNode[] = []

  // ---- Rotation gizmo: limit fan + arc + current-angle pointer -------------
  if (isRot) {
    const R = 30
    // #74：螺旋关节可驱动到 ±1080°（多圈进给），默认限位同 JointsPanel 滑杆一致；其余转动类单圈 ±180°。
    const isScrew = j.type === 'screw'
    const lo = (j.aMin ?? (isScrew ? -1080 : -180)) * DEG
    const hi = (j.aMax ?? (isScrew ? 1080 : 180)) * DEG
    // #74：跨度超过一整圈 → 用外扩螺旋显示每一圈进度（平面扇区绕 N 圈会重叠成一个盘，睇唔出真实圈数/行程）。
    const span = Math.abs(hi - lo)
    const multiTurn = span > 2 * Math.PI + 1e-6
    const denom = hi - lo || 1
    const rAt = (frac: number) => multiTurn ? 12 + (R - 12) * Math.max(0, Math.min(1, frac)) : R
    const N = multiTurn ? Math.min(288, Math.max(48, Math.round((span / (2 * Math.PI)) * 64))) : 48
    const arc: Vector3[] = []
    for (let i = 0; i <= N; i++) {
      const frac = i / N
      const t = lo + (hi - lo) * frac
      const r = rAt(frac)
      arc.push(
        new Vector3(
          a.x + r * (Math.cos(t) * u.x + Math.sin(t) * v.x),
          a.y + r * (Math.cos(t) * u.y + Math.sin(t) * v.y),
          a.z + r * (Math.cos(t) * u.z + Math.sin(t) * v.z),
        ),
      )
    }
    // faint closed fan (anchor → arc → back to anchor) — single-turn 先画扇形；螺旋唔画（否则糊成一片）
    if (!multiTurn) {
      const fan: Vector3[] = [a.clone(), ...arc, a.clone()]
      els.push(
        <Line key="rot-fan" points={fan} color={ROT_COLOR} lineWidth={1} transparent opacity={0.35} depthTest={false} renderOrder={996} />,
      )
    }
    // solid limit arc / multi-turn spiral
    els.push(
      <Line key="rot-arc" points={arc} color={ROT_COLOR} lineWidth={2.5} depthTest={false} renderOrder={997} />,
    )
    // current-angle pointer — CLAMP first (match FK clampA) so it never leaves the fan/spiral.
    const clamped = Math.min(j.aMax ?? Infinity, Math.max(j.aMin ?? -Infinity, j.angle ?? 0))
    const tc = clamped * DEG
    const rc = rAt((tc - lo) / denom)
    const pc = new Vector3(
      a.x + rc * (Math.cos(tc) * u.x + Math.sin(tc) * v.x),
      a.y + rc * (Math.cos(tc) * u.y + Math.sin(tc) * v.y),
      a.z + rc * (Math.cos(tc) * u.z + Math.sin(tc) * v.z),
    )
    els.push(
      <Line key="rot-ptr" points={[a.clone(), pc]} color="#ffffff" lineWidth={2.5} depthTest={false} renderOrder={998} />,
    )
    els.push(
      <mesh key="rot-bead" position={pc} renderOrder={998}>
        <sphereGeometry args={[2.4, 16, 16]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} />
      </mesh>,
    )
    // ball: only the primary axis rotation is shown here; angle2/angle3 (the extra
    // Y/X rotations) are edited in the joint panel — honest partial visualization.
  }

  // ---- Slider gizmo: travel segment + bead + end arrows -------------------
  if (isSld) {
    let dir: Vector3
    if (j.type === 'planar') dir = u.clone()
    else if (j.type === 'pinslot') dir = j.axis2 ? new Vector3(j.axis2[0], j.axis2[1], j.axis2[2]).normalize() : u.clone()
    else dir = ax.clone()

    const lo = j.sMin ?? -60
    const hi = j.sMax ?? 60
    const p0 = new Vector3(a.x + dir.x * lo, a.y + dir.y * lo, a.z + dir.z * lo)
    const p1 = new Vector3(a.x + dir.x * hi, a.y + dir.y * hi, a.z + dir.z * hi)
    els.push(
      <Line key="sld-seg" points={[p0, p1]} color={SLD_COLOR} lineWidth={2.5} depthTest={false} renderOrder={997} />,
    )
    const s = j.slide ?? 0
    const pSlide = new Vector3(a.x + dir.x * s, a.y + dir.y * s, a.z + dir.z * s)
    els.push(
      <mesh key="sld-bead" position={pSlide} renderOrder={998}>
        <sphereGeometry args={[2.4, 16, 16]} />
        <meshBasicMaterial color={SLD_COLOR} depthTest={false} />
      </mesh>,
    )
    // cone arrows at both ends, pointing ±dir
    const qPos = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone())
    const qNeg = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().multiplyScalar(-1))
    els.push(
      <mesh key="sld-arrow-hi" position={p1} quaternion={qPos} renderOrder={998}>
        <coneGeometry args={[2, 6, 10]} />
        <meshBasicMaterial color={SLD_COLOR} depthTest={false} />
      </mesh>,
    )
    els.push(
      <mesh key="sld-arrow-lo" position={p0} quaternion={qNeg} renderOrder={998}>
        <coneGeometry args={[2, 6, 10]} />
        <meshBasicMaterial color={SLD_COLOR} depthTest={false} />
      </mesh>,
    )
  }

  // ---- Anchor sphere (always) --------------------------------------------
  // rigid renders ONLY this — an honest "locked, 0 DOF" marker.
  const anchorColor = isRot ? ROT_COLOR : isSld ? SLD_COLOR : RIGID_COLOR
  els.push(
    <mesh key="anchor" position={a} renderOrder={998}>
      <sphereGeometry args={[3, 16, 16]} />
      <meshBasicMaterial color={anchorColor} depthTest={false} />
    </mesh>,
  )

  return <group>{els}</group>
}
