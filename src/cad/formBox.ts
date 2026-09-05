import { makeBoxCage } from './subdiv.ts'

export type FormBoxPlane = 'XY' | 'XZ' | 'YZ'
export type FormBoxStage = 'plane' | 'center' | 'size' | 'height' | 'ready'

export type FormBoxDraft = {
  stage: FormBoxStage
  plane: FormBoxPlane | null
  planeOffset: number
  center: [number, number] | null
  cursor: [number, number]
  length: number
  width: number
  height: number
  lengthFaces: number
  widthFaces: number
  heightFaces: number
  direction: 'one' | 'symmetric'
  symmetry: 'none' | 'x' | 'y' | 'z'
  heightAnchorY: number | null
}

export const newFormBoxDraft = (): FormBoxDraft => ({
  stage: 'plane',
  plane: null,
  planeOffset: 0,
  center: null,
  cursor: [0, 0],
  length: 40,
  width: 30,
  height: 20,
  lengthFaces: 2,
  widthFaces: 2,
  heightFaces: 2,
  direction: 'one',
  symmetry: 'none',
  heightAnchorY: null,
})

export function formBoxSizeFromPoints(center: [number, number], cursor: [number, number]) {
  return {
    length: Math.max(0.1, Math.abs(cursor[0] - center[0]) * 2),
    width: Math.max(0.1, Math.abs(cursor[1] - center[1]) * 2),
  }
}

export function formPlanePointToCad(plane: FormBoxPlane, uv: [number, number], normal = 0): [number, number, number] {
  if (plane === 'XY') return [uv[0], uv[1], normal]
  if (plane === 'XZ') return [uv[0], normal, uv[1]]
  return [normal, uv[0], uv[1]]
}

export function cadPointToThree(p: [number, number, number]): [number, number, number] {
  return [p[0], p[2], -p[1]]
}

export function formBoxRectCadCorners(draft: FormBoxDraft): [number, number, number][] {
  if (!draft.plane || !draft.center) return []
  const hx = draft.length / 2, hy = draft.width / 2
  const [u, v] = draft.center
  return [
    formPlanePointToCad(draft.plane, [u - hx, v - hy], draft.planeOffset),
    formPlanePointToCad(draft.plane, [u + hx, v - hy], draft.planeOffset),
    formPlanePointToCad(draft.plane, [u + hx, v + hy], draft.planeOffset),
    formPlanePointToCad(draft.plane, [u - hx, v + hy], draft.planeOffset),
    formPlanePointToCad(draft.plane, [u - hx, v - hy], draft.planeOffset),
  ]
}

export function makePlacedBoxCage(draft: FormBoxDraft) {
  if (!draft.plane || !draft.center) throw new Error('Form Box needs a plane and center')
  const L = Math.max(0.1, draft.length)
  const W = Math.max(0.1, draft.width)
  const H = Math.max(0.1, draft.height)
  const nx = Math.max(1, Math.round(draft.lengthFaces))
  const ny = Math.max(1, Math.round(draft.widthFaces))
  const nz = Math.max(1, Math.round(draft.heightFaces))
  const cage = makeBoxCage(L, W, H, nx, ny, nz)
  const base = draft.planeOffset + (draft.direction === 'symmetric' ? -H / 2 : 0)
  const verts = cage.verts.map(([x, y, z]) => {
    const localNormal = base + z
    const uv: [number, number] = [draft.center![0] + x, draft.center![1] + y]
    return formPlanePointToCad(draft.plane!, uv, localNormal)
  })
  return { L, W, H, nx, ny, nz, verts, quads: cage.quads }
}
