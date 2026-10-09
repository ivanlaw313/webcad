// BUG(C)：装配质心／包围盒必须用【组件世界变换】（pos + rot + 关节 FK + CAD→three），
// 否则关节（例：刚性关节把子件拉到父件处）之后质心仍按未驱动位置计 → 报出喺装配 bbox 外面。
// 纯函数（无 three 依赖）：M = 4×4 列主序 elements（three Matrix4.elements 同格式）。
import { computeMassProps } from '../cad/massProps'

type Vec3 = [number, number, number]
type MeshLike = { vertices: ArrayLike<number>; triangles: ArrayLike<number> }

export function transformVertices(v: ArrayLike<number>, M: ArrayLike<number>): number[] {
  const out = new Array<number>(v.length)
  for (let i = 0; i < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = v[i + 2]
    out[i] = M[0] * x + M[4] * y + M[8] * z + M[12]
    out[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13]
    out[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14]
  }
  return out
}

export type AsmMassPart = { meshes: MeshLike[]; M: ArrayLike<number>; density?: number }

// 质量加权（density g/cm³，缺省 1 → 体积加权）质心 + 世界 bbox。centroid=null ⇔ 无正体积。
export function assemblyMassSummary(parts: AsmMassPart[]): { volume: number; mass: number; centroid: Vec3 | null; min: Vec3; max: Vec3 } {
  let volume = 0, mass = 0, cx = 0, cy = 0, cz = 0
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const p of parts) for (const m of p.meshes) {
    if (!m.vertices.length || m.triangles.length < 3) continue
    const wv = transformVertices(m.vertices, p.M)
    for (let i = 0; i < wv.length; i += 3) for (let k = 0; k < 3; k++) { const x = wv[i + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x }
    const mp = computeMassProps(wv, m.triangles)
    if (!(mp.volume > 0)) continue
    const w = mp.volume * (p.density ?? 1)
    volume += mp.volume; mass += w / 1000
    cx += mp.centroid[0] * w; cy += mp.centroid[1] * w; cz += mp.centroid[2] * w
  }
  const W = mass * 1000
  return { volume, mass, centroid: W > 0 ? [cx / W, cy / W, cz / W] : null, min, max }
}

// RETEST17 #4：three 世界（Y-up）→ CAD（Z-up）報數：compWorldMatrix 用 Rx(−90°) 把 CAD (x,y,z) 映到 three (x, z, −y)，
// 反向 = CAD (x, −z, y)。裝配 HUD 嘅總尺寸已按 W(x)×D(CAD y)×H(CAD z) 報 → 質心都要用同一 CAD 坐標（舊版直接報 three xyz，
// Z 向高嘅零件質心 Y/Z 對調）。−0 歸一為 0（免顯示「-0.0」）。
export function threeToCadPoint(p: ArrayLike<number>): Vec3 {
  const z0 = (x: number) => (Object.is(x, -0) || Math.abs(x) < 1e-12 ? 0 : x)
  return [z0(p[0]), z0(-p[2]), z0(p[1])]
}
