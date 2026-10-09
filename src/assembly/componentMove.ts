// ASM2 P2：用戶移動組件（功能區「移動／複製」、選中組件工具列 X/Y/Z／旋轉欄）必須尊重關節。
// 組件位置 world = fk · T(pos) · …；關節 anchor/axis 係 world 座標 —— 單獨改某件 pos 會令佢脫離關節軸線。
// 規則（純函數，可單元測試）：
//   • 冇關節嘅組件：照舊直接移動（已固定 → 拒絕）
//   • 單一組件係滑動類關節（slider／cylindrical／pinslot）子件、純平移且平行滑動軸 → 改為驅動該關節（slide += d·軸）
//   • 以關節連接嘅整組（無一件已固定）平移 → 成組一齊平移，組內關節錨點同步平移（關節保持）
//   • 其餘（組內有已固定件、或旋轉關節組）→ 拒絕並說明原因
import { Vector3 } from 'three'
import { jointSlideDir } from './jointHandleDrag'

type V3 = [number, number, number]
export type MoveComp = { id: string; name: string; grounded?: boolean }
export type MoveJoint = { id: string; name?: string; type: string; parent: string; child: string; anchor: V3; axis: V3; slide?: number; flip?: boolean; axis2?: V3 }
export type MovePlan =
  | { kind: 'free'; ids: string[] }
  | { kind: 'group'; ids: string[]; jointIds: string[] }
  | { kind: 'drive'; jointId: string; slide: number; compId: string }
  | { kind: 'refuse'; msg: string }

const SLIDING = new Set(['slider', 'cylindrical', 'pinslot'])

/** 以關節（任一方向）連接嘅組件集合（含自己）。 */
export function jointGroupOf(id: string, joints: readonly MoveJoint[]): Set<string> {
  const g = new Set([id]); const q = [id]
  while (q.length) {
    const c = q.pop()!
    for (const j of joints) {
      const o = j.parent === c ? j.child : j.child === c ? j.parent : null
      if (o && !g.has(o)) { g.add(o); q.push(o) }
    }
  }
  return g
}

export function planComponentMove(ids: readonly string[], d: V3, r: V3, comps: readonly MoveComp[], joints: readonly MoveJoint[], groundedId: string | null = null): MovePlan {
  const name = (id: string) => comps.find((c) => c.id === id)?.name ?? id
  const isG = (id: string) => groundedId === id || !!comps.find((c) => c.id === id)?.grounded
  const jn = (j: MoveJoint) => j.name || j.id
  const rot = !!(r[0] || r[1] || r[2]), len = Math.hypot(d[0], d[1], d[2])
  const all = new Set<string>(), jointed: string[] = []
  for (const id of ids) { const g = jointGroupOf(id, joints); if (g.size > 1) jointed.push(id); g.forEach((x) => all.add(x)) }
  if (!jointed.length) {
    const gid = ids.find(isG)
    return gid ? { kind: 'refuse', msg: `「${name(gid)}」（已固定）— 請先取消固定才可移動` } : { kind: 'free', ids: [...ids] }
  }
  // 單一滑動類子件、純平移 → 若平行滑動軸，改為驅動關節
  if (ids.length === 1 && !rot && len > 1e-9) {
    const id = ids[0]
    const own = [...joints].reverse().find((j) => j.child === id)
    if (own && SLIDING.has(own.type)) {
      const dir = jointSlideDir(own as never) as Vector3
      const s = d[0] * dir.x + d[1] * dir.y + d[2] * dir.z
      const perp = Math.hypot(d[0] - s * dir.x, d[1] - s * dir.y, d[2] - s * dir.z)
      if (perp <= Math.max(1e-3, 1e-4 * len)) return { kind: 'drive', jointId: own.id, slide: Math.round(((own.slide ?? 0) + s) * 1000) / 1000, compId: id }
    }
  }
  const id0 = jointed[0], j0 = joints.find((j) => j.parent === id0 || j.child === id0)!
  if (rot) return { kind: 'refuse', msg: `「${name(id0)}」以關節「${jn(j0)}」連接 — 直接旋轉會令其脫離關節軸線。請以關節驅動（拖動關節把手或「關節」面板滑桿），或先刪除關節` }
  const gid = [...all].find(isG)
  if (gid) {
    const slideHint = (() => { const own = [...joints].reverse().find((j) => j.child === id0); return own && SLIDING.has(own.type) ? `（只可沿關節「${jn(own)}」的滑動軸移動）` : '' })()
    return { kind: 'refuse', msg: `「${name(id0)}」以關節「${jn(j0)}」連接到已固定的「${name(gid)}」— 直接移動會令其脫離關節軸線${slideHint}。請拖動關節把手或「關節」面板滑桿驅動；如需重新定位，請先刪除關節或取消固定` }
  }
  return { kind: 'group', ids: [...all], jointIds: joints.filter((j) => all.has(j.parent) && all.has(j.child)).map((j) => j.id) }
}

/** 功能區「移動／複製」嘅 CAD（Z 向上）位移／旋轉 → three.js world（Y 向上）：x→x、y→−z、z→y。 */
export function cadMoveToWorld(dx: number, dy: number, dz: number, rx: number, ry: number, rz: number): { d: V3; r: V3 } {
  const z = (v: number) => (v === 0 ? 0 : v)   // 唔要 -0
  return { d: [z(dx), z(dz), z(-dy)], r: [z(rx), z(rz), z(-ry)] }
}
