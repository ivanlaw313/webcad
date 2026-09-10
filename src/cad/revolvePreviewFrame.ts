import { cardinalSketchFrame, localPointToCad, type CardinalPlane, type PlaneFrame } from './sketchPlaneFrame'
type P2 = [number, number]
export type RevolveFrameSource = { plane?: CardinalPlane; baseZ?: number; arb?: PlaneFrame; arbPlane?: PlaneFrame; faceBinding?: unknown; sketchFaceBinding?: unknown }
export function revolveFrame(source: RevolveFrameSource): PlaneFrame {
  const offset=source.baseZ ?? 0
  const legacyXZ=source.plane==='XZ' && !source.faceBinding && !source.sketchFaceBinding
  return source.arb ?? source.arbPlane ?? cardinalSketchFrame(source.plane ?? 'XY',legacyXZ ? -offset : offset)
}
/** New dialog loops are sketch s/t; saved feature loops are kernel u/v. */
export function revolvePointToCad(point:P2,source:RevolveFrameSource,rawSketch:boolean):[number,number,number] {
  const plane=source.plane ?? 'XY'
  const uv=rawSketch && !source.arb && !source.arbPlane
    ? plane==='XY' ? [point[0],-point[1]] : plane==='YZ' ? [-point[0],point[1]] : point : point
  return localPointToCad(revolveFrame(source),uv[0],uv[1])
}
