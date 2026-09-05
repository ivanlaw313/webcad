// Assembly mate solver — self-written, license-safe (no deps). Bounding-box based so it is reliable
// WITHOUT per-face / per-axis picking (which OCCT-wasm face IDs make fragile in the browser). Honest
// window-version of Fusion/SolidWorks mates: it aligns/centres WHOLE-PART bounding boxes, which covers
// the maker-common cases (stack a part on another, drop a peg coaxially into a counterbored hub, hold a
// fixed gap) — but it is NOT a general face-pair constraint solver. Flagged as such in the UI.
//
// All coordinates are three.js WORLD space. A component's `pos` is a world-frame translation applied AFTER
// the CAD→world rotation (see compWorldMatrix), so the world delta returned here can be added straight to
// `pos`. A = stationary target, B = the part being moved.

export type AABB = { mn: [number, number, number]; mx: [number, number, number] }
export type MateType = 'concentric' | 'flush' | 'distance'
export type MateAxis = 0 | 1 | 2 // X | Y | Z
export type MateSide = 1 | -1

export const AXIS_LABEL = ['X', 'Y', 'Z'] as const

// World AABB of a component given its already-computed world matrix (column-major, three.js order) + mesh verts.
export function worldAABB(elems: ArrayLike<number>, verts: ArrayLike<number>): AABB {
  const M = elems
  const mn: [number, number, number] = [Infinity, Infinity, Infinity]
  const mx: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i], y = verts[i + 1], z = verts[i + 2]
    const wx = M[0] * x + M[4] * y + M[8] * z + M[12]
    const wy = M[1] * x + M[5] * y + M[9] * z + M[13]
    const wz = M[2] * x + M[6] * y + M[10] * z + M[14]
    if (wx < mn[0]) mn[0] = wx; if (wx > mx[0]) mx[0] = wx
    if (wy < mn[1]) mn[1] = wy; if (wy > mx[1]) mx[1] = wy
    if (wz < mn[2]) mn[2] = wz; if (wz > mx[2]) mx[2] = wz
  }
  return { mn, mx }
}

const ctr = (b: AABB, k: number) => (b.mn[k] + b.mx[k]) / 2

// Solve the world-translation delta to apply to B's pos so B mates onto A.
//   concentric : centre B on A in the two axes ⊥ to `axis`; leave the `axis` position untouched.
//   flush      : centre the ⊥ axes AND bring B's face into contact with A's face on `axis` (side ±).
//   distance   : like flush but hold a gap of `distance` mm between the faces (side ±).
//                Negative distance = insertion (B overlaps past A's face) — lid lips, plugs, press-fits.
// `side = +1` puts B on the +axis side of A (B's min face meets A's max face); −1 is the mirror.
export function solveMate(
  A: AABB, B: AABB, type: MateType, axis: MateAxis = 1, side: MateSide = 1, distance = 0,
): [number, number, number] {
  const d: [number, number, number] = [0, 0, 0]
  // Centre the two axes perpendicular to the mate axis (always — keeps parts coaxial/concentric).
  for (let k = 0; k < 3; k++) if (k !== axis) d[k] = ctr(A, k) - ctr(B, k)
  if (type === 'concentric') return d // axis position left as-is
  const gap = type === 'distance' ? distance : 0
  d[axis] = side === 1
    ? A.mx[axis] + gap - B.mn[axis]   // B sits on A's +axis face, optional gap
    : A.mn[axis] - gap - B.mx[axis]   // B sits on A's −axis face
  return d
}

// Convenience: apply the solved delta to a pos.
export function applyMate(pos: [number, number, number], delta: [number, number, number]): [number, number, number] {
  return [pos[0] + delta[0], pos[1] + delta[1], pos[2] + delta[2]]
}
