import type {SketchShape} from '../store'
import {circum3,type SkCon,type FPt} from './freesolve'
import {buildMoveCandidate,solveMoveCandidate,type MoveCandidate} from './moveRelations'
export type ScaleTransform={factor:number;cx:number;cy:number}
/** Stable per-entity reference centers, independent of display tessellation density. */
export function scaleSelectionCenter(shapes:SketchShape[],indices:number[]):FPt|null{
 const centers:FPt[]=[]
 for(const i of [...new Set(indices)]){const sh=shapes[i];if(!sh)return null
   if(sh.type==='circle'){centers.push(sh.c);continue}
   if(sh.type==='rect'){centers.push([(sh.a[0]+sh.b[0])/2,(sh.a[1]+sh.b[1])/2]);continue}
   if(sh.ell||sh.earc){const e=sh.ell??sh.earc!;centers.push([e.cx,e.cy]);continue}
   if(sh.arc){const c=circum3(sh.arc.a,sh.arc.m,sh.arc.b);if(!c)return null;centers.push(c.c);continue}
   let pts=sh.ctrl??sh.verts??sh.pts
   if(pts.length>1&&Math.hypot(pts[0][0]-pts.at(-1)![0],pts[0][1]-pts.at(-1)![1])<1e-10)pts=pts.slice(0,-1)
   if(!pts.length)return null
   centers.push([pts.reduce((v,p)=>v+p[0],0)/pts.length,pts.reduce((v,p)=>v+p[1],0)/pts.length])
 }
 return centers.length&&centers.every(p=>p.every(Number.isFinite))?[centers.reduce((v,p)=>v+p[0],0)/centers.length,centers.reduce((v,p)=>v+p[1],0)/centers.length]:null
}
/** Uniform positive scale changes geometry only, never user dimensions or links. */
export function transformScaleShape(shape:SketchShape,{factor:k,cx,cy}:ScaleTransform):SketchShape{
 if(k===1)return shape
 const point=(p:FPt):FPt=>[cx+(p[0]-cx)*k,cy+(p[1]-cy)*k],sh=structuredClone(shape)
 if(sh.type==='circle')return{...sh,c:point(sh.c),r:sh.r*k}
 if(sh.type==='rect')return{...sh,a:point(sh.a),b:point(sh.b)}
 const out:SketchShape={...sh,pts:sh.pts.map(point)}
 if(sh.ctrl)out.ctrl=sh.ctrl.map(point)
 if(sh.verts)out.verts=sh.verts.map(point)
 if(sh.arc)out.arc={a:point(sh.arc.a),b:point(sh.arc.b),m:point(sh.arc.m)}
 if(sh.ell){const C=point([sh.ell.cx,sh.ell.cy]);out.ell={...sh.ell,cx:C[0],cy:C[1],rx:sh.ell.rx*k,ry:sh.ell.ry*k}}
 if(sh.earc){const C=point([sh.earc.cx,sh.earc.cy]);out.earc={...sh.earc,cx:C[0],cy:C[1],rx:sh.earc.rx*k,ry:sh.earc.ry*k}}
 return out
}
export function buildScaleCandidate(shapes:SketchShape[],cons:SkCon[],indices:number[],transform:ScaleTransform):MoveCandidate{
 if(![transform.factor,transform.cx,transform.cy].every(Number.isFinite)||transform.factor<=0)return{ok:false,reason:'Scale requires a positive finite factor and finite pivot.'}
 const base=buildMoveCandidate(shapes,cons,indices,{dx:0,dy:0,angleDeg:0,cx:transform.cx,cy:transform.cy})
 if(!base.ok)return{ok:false,reason:base.reason.replace(/move/gi,'scale')}
 const selected=new Set(base.selectedIndices),next=shapes.map((sh,i)=>selected.has(i)?transformScaleShape(sh,transform):sh)
 if(transform.factor!==1&&base.selectedIndices.some(i=>shapes[i].type==='poly'&&(shapes[i] as Extract<SketchShape,{type:'poly'}>).projectLink))return{ok:false,reason:'Linked projected geometry must be detached explicitly before scaling.'}
 return{...base,shapes:next,targetShapes:base.selectedIndices.map(i=>next[i])}
}
export async function solveScaleCandidate(original:SketchShape[],candidate:Extract<MoveCandidate,{ok:true}>){
 const result=await solveMoveCandidate(original,candidate)
 return result.ok?result:{ok:false as const,reason:result.reason.replace(/move/gi,'scale')}
}
