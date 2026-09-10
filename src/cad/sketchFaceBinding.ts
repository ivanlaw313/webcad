import type { CubicBezierSegment } from '../sketch/splineBezier'
/** Ordinary planar-face attachment, independent of datum-plane references.
 * The anchor is evaluated at sourceId's timeline prefix, never on the final body.
 * First consumer: extrusion. Rigid translation with an unchanged oriented face;
 * Unchanged support planes can survive boundary edits when the original picked
 * interior anchor still belongs to exactly one face. Rotation and ambiguous
 * topology changes require explicit repair for now.
 */
export type SketchFaceBinding = {
  sourceId: string
  center: [number, number, number]
  outline: string[]
  near: [number, number, number]
  normal: [number, number, number]
  offset: number
  area: number
  edgeLengths: number[]
  faceFp: string[]
  faceFpV2: string[]
  faceFpTopo: string[]
}
export type ResolvedSketchFace = { binding: SketchFaceBinding; delta: [number, number, number] }

import type { SketchProfile, Plane } from '../worker/cad.worker'
import type { SketchShape } from '../store'
type V3 = [number, number, number]
type P2 = [number, number]
type Arb = { o: V3; xd: V3; n: V3 }
/** Kernel profile coordinates differ from the on-screen sketch coordinates. */
export function faceProfileDelta(plane: Plane, delta: V3): P2 {
  return plane === 'YZ' ? [delta[1],delta[2]] : plane === 'XZ' ? [delta[0],delta[2]] : [delta[0],delta[1]]
}
export function faceSketchDelta(plane: Plane, delta: V3): P2 {
  return plane === 'YZ' ? [-delta[1],delta[2]] : plane === 'XZ' ? [delta[0],delta[2]] : [delta[0],-delta[1]]
}
export function translateBoundProfile(profile: SketchProfile, delta: P2): SketchProfile {
  if (!delta[0] && !delta[1]) return profile
  const p=(v:P2):P2=>[v[0]+delta[0],v[1]+delta[1]]
  const holes=profile.holes?.map(h=>translateBoundProfile(h,delta)),islands=profile.islands?.map(h=>translateBoundProfile(h,delta))
  const nested={...(holes?{holes}:{}),...(islands?{islands}:{})}
  if(profile.kind==='rect')return {...profile,...nested,a:p(profile.a),b:p(profile.b)}
  if(profile.kind==='circle'||profile.kind==='ellipse')return {...profile,...nested,c:p(profile.c)}
  return {...profile,...nested,pts:profile.pts.map(p),...(profile.cubics?{cubics:profile.cubics.map(seg=>seg.map(p) as CubicBezierSegment)}:{}),...(profile.verts?{verts:profile.verts.map(p)}:{}),...(profile.arc?{arc:{a:p(profile.arc.a),b:p(profile.arc.b),m:p(profile.arc.m)}}:{}),...(profile.earc?{earc:{...profile.earc,cx:profile.earc.cx+delta[0],cy:profile.earc.cy+delta[1]}}:{})}
}
/** Preserve every shape flag and analytic representation while moving coordinates. */
export function translateBoundShape(shape: SketchShape, delta: P2): SketchShape {
  if (!delta[0] && !delta[1]) return shape
  const p=(v:P2):P2=>[v[0]+delta[0],v[1]+delta[1]]
  if(shape.type==='rect')return {...shape,a:p(shape.a),b:p(shape.b)}
  if(shape.type==='circle')return {...shape,c:p(shape.c)}
  return {...shape,pts:shape.pts.map(p),...(shape.ctrl?{ctrl:shape.ctrl.map(p)}:{}),...(shape.verts?{verts:shape.verts.map(p)}:{}),...(shape.arc?{arc:{a:p(shape.arc.a),b:p(shape.arc.b),m:p(shape.arc.m)}}:{}),...(shape.ell?{ell:{...shape.ell,cx:shape.ell.cx+delta[0],cy:shape.ell.cy+delta[1]}}:{}),...(shape.earc?{earc:{...shape.earc,cx:shape.earc.cx+delta[0],cy:shape.earc.cy+delta[1]}}:{})}
}
export function shiftBoundSketchFeature<T extends { baseZ?: number; plane?: Plane; arbPlane?: Arb; profile?: SketchProfile; axisOrigin?: V3; axisReference?: 'sketch'|'world' }>(feature:T,delta:V3):T {
  const axis=feature.axisReference==='sketch' && feature.axisOrigin ? {axisOrigin:feature.axisOrigin.map((x,i)=>x+delta[i]) as V3} : {}
  if(feature.arbPlane)return {...feature,...axis,arbPlane:{...feature.arbPlane,o:feature.arbPlane.o.map((x,i)=>x+delta[i]) as V3}}
  const plane=feature.plane??'XY'
  return {...feature,...axis,baseZ:(feature.baseZ??0)+delta[plane==='YZ'?0:plane==='XZ'?1:2],...(feature.profile?{profile:translateBoundProfile(feature.profile,faceProfileDelta(plane,delta))}:{})}
}
/** Initial default Revolve axis origin; direction remains an explicit CAD vector. */
export function boundSketchOrigin(frame:{plane?:Plane;baseZ?:number;arb?:Arb;arbPlane?:Arb}):V3 {
  return [...(frame.arb?.o ?? frame.arbPlane?.o ?? (frame.plane==='YZ'?[frame.baseZ??0,0,0]:frame.plane==='XZ'?[0,frame.baseZ??0,0]:[0,0,frame.baseZ??0]))] as V3
}
