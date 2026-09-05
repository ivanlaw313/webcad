/**
 * Shared local-to-CAD frames for cardinal sketch planes.
 *
 * The normal is the direction the kernel actually uses for an ordinary
 * non-symmetric extrude.  In particular XZ is -Y, matching RES_SIGN rather
 * than the positive geometric plane normal.
 */
export type CardinalPlane = 'XY' | 'XZ' | 'YZ'
export type PlaneFrame = {
  o: [number, number, number]
  xd: [number, number, number]
  n: [number, number, number]
}

export function cardinalSketchFrame(plane: CardinalPlane, offset: number): PlaneFrame {
  if (plane === 'XZ') return { o: [0, offset, 0], xd: [1, 0, 0], n: [0, -1, 0] }
  if (plane === 'YZ') return { o: [offset, 0, 0], xd: [0, 1, 0], n: [1, 0, 0] }
  return { o: [0, 0, offset], xd: [1, 0, 0], n: [0, 0, 1] }
}

export function frameY(frame: PlaneFrame): [number, number, number] {
  const [nx, ny, nz] = frame.n, [xx, xy, xz] = frame.xd
  // Canonicalise -0 so persisted feature payloads and strict tests remain
  // stable across engines; geometrically it is exactly the same direction.
  const z = (v: number) => v === 0 ? 0 : v
  return [z(ny * xz - nz * xy), z(nz * xx - nx * xz), z(nx * xy - ny * xx)]
}

export function localPointToCad(frame: PlaneFrame, u: number, v: number): [number, number, number] {
  const yd = frameY(frame)
  return [frame.o[0] + frame.xd[0] * u + yd[0] * v, frame.o[1] + frame.xd[1] * u + yd[1] * v, frame.o[2] + frame.xd[2] * u + yd[2] * v]
}
