import {sketchesNumericallyEqual} from './constrainedDrag'
import type {SketchShape} from '../store'
import {transformCopyShape,type CopyTransform} from './copyRelations'
import {solveFree,refPts,refValid,arcResample,applyRelationUpdates,type SkCon,type SkRef} from './freesolve'
import {ellipseControlPoints} from './ellipseGeometry'
import {ellipseArcPoint,ellipseArcSweep} from './ellipseArcGeometry'
export type MoveCandidate={ok:true;shapes:SketchShape[];cons:SkCon[];selectedIndices:number[];targetShapes:SketchShape[]}|{ok:false;reason:string}
const finite=(v:unknown):boolean=>typeof v==='number'?Number.isFinite(v):Array.isArray(v)?v.every(finite):v&&typeof v==='object'?Object.values(v).every(finite):true
const near=(a:unknown,b:unknown):boolean=>typeof a==='number'&&typeof b==='number'?Math.abs(a-b)<1e-7:Array.isArray(a)&&Array.isArray(b)?a.length===b.length&&a.every((v,i)=>near(v,b[i])):a===b
function geometry(sh:SketchShape):unknown{
 if(sh.type==='circle')return[sh.c,sh.r]
 if(sh.type==='rect')return[sh.a,[sh.b[0],sh.a[1]],sh.b,[sh.a[0],sh.b[1]]]
 if(sh.earc)return[ellipseControlPoints(sh.earc),ellipseArcPoint(sh.earc,sh.earc.a0),ellipseArcPoint(sh.earc,sh.earc.a0+ellipseArcSweep(sh.earc)),ellipseArcSweep(sh.earc)]
 if(sh.ell)return ellipseControlPoints(sh.ell)
 if(sh.arc)return arcResample(sh.arc.a,sh.arc.b,sh.arc.m,24)
 if(sh.verts&&sh.bulges)return[sh.verts,sh.bulges]
 return sh.ctrl??sh.pts
}
function fixedGeometry(shapes:SketchShape[],r:SkRef):unknown{
 if('shape'in r&&(r.kind==='ellipse'||r.kind==='ellipse-arc'||r.kind==='circle'))return geometry(shapes[r.shape])
 return refPts(shapes,r)
}
export function buildMoveCandidate(shapes:SketchShape[],cons:SkCon[],sourceIndices:number[],transform:CopyTransform):MoveCandidate{
 const selectedIndices=[...new Set(sourceIndices)]
 if(!selectedIndices.length||selectedIndices.some(i=>!Number.isInteger(i)||!shapes[i])||!finite(transform))return{ok:false,reason:'Move requires valid selected geometry and a finite rigid transform.'}
 const selected=new Set(selectedIndices),next=shapes.map((sh,i)=>{
   if(!selected.has(i))return sh
   const moved=transformCopyShape(sh,transform)
   if(sh.type==='poly'&&moved.type==='poly')for(const k of['projected','projectLink','projectLinkIssue','projectLinkSource'] as const)if(sh[k]!==undefined)Object.assign(moved,{[k]:structuredClone(sh[k])})
   return JSON.stringify(geometry(sh))===JSON.stringify(geometry(moved))?sh:moved
 }),nextCons=[...cons],used=new Set(cons.map(c=>c.id))
 if(!finite(next))return{ok:false,reason:'Move contains invalid coordinates.'}
 for(const i of selectedIndices){const sh=shapes[i];if(sh.type==='poly'&&sh.projectLink&&!near(geometry(sh),geometry(next[i])))return{ok:false,reason:'Linked projected geometry must be detached explicitly before moving.'}
   if(sh.type==='rect'&&next[i].type==='poly')for(let idx=0;idx<4;idx++){
     if(cons.some(c=>c.kind==='con'&&c.type===(idx%2?'v':'h')&&c.a.kind==='edge'&&c.a.shape===i&&c.a.idx===idx&&(!c.frameAngleDeg||Math.abs(c.frameAngleDeg%180)<1e-8)))continue
     let id=`move:rect:${i}:${idx}`;while(used.has(id))id+='_';used.add(id);nextCons.push({id,kind:'con',type:idx%2?'v':'h',frameAngleDeg:transform.angleDeg,a:{kind:'edge',shape:i,idx}})
   }
 }
 for(const c of cons)if(c.kind==='con'&&c.type==='fix'&&(!refValid(shapes,c.a)||!near(fixedGeometry(shapes,c.a),fixedGeometry(next,c.a))))return{ok:false,reason:`Move would redefine fixed geometry (${c.id}).`}
 return{ok:true,shapes:next,cons:nextCons,selectedIndices,targetShapes:selectedIndices.map(i=>next[i])}
}
/** Protect requested selected geometry, permit connected free geometry to follow,
 * then validate the persistent system without adding permanent Fix constraints. */
export async function solveMoveCandidate(original:SketchShape[],candidate:Extract<MoveCandidate,{ok:true}>):Promise<{ok:true;shapes:SketchShape[];cons:SkCon[];dof:number;changed:boolean}|{ok:false;reason:string}>{
 const selected=new Set(candidate.selectedIndices),targetValid=(shapes:SketchShape[])=>candidate.selectedIndices.every((i,j)=>!!shapes[i]&&near(geometry(shapes[i]),geometry(candidate.targetShapes[j]))),fixedValid=(shapes:SketchShape[])=>candidate.cons.every(c=>c.kind!=='con'||c.type!=='fix'||near(fixedGeometry(original,c.a),fixedGeometry(shapes,c.a)))
 if(!finite(candidate.shapes)||!targetValid(candidate.shapes)||!fixedValid(candidate.shapes))return{ok:false,reason:'Move candidate changes an original fixed anchor.'}
 const pins:SkCon[]=[],used=new Set(candidate.cons.map(c=>c.id)),pin=(a:SkRef)=>{let id=`move:target-pin:${pins.length}`;while(used.has(id))id+='_';used.add(id);pins.push({id,kind:'con',type:'fix',a})}
 for(const i of selected){const sh=candidate.shapes[i];if(sh.type==='circle'){pin(sh.point?{kind:'pt',shape:i,idx:0}:{kind:'circle',shape:i});continue}if(sh.type==='poly'&&sh.ell){pin({kind:'ellipse',shape:i});continue}if(sh.type==='poly'&&sh.earc){pin({kind:'ellipse-arc',shape:i});continue}const n=sh.type==='rect'?4:sh.arc?2:(sh.ctrl??sh.verts??sh.pts).length;for(let idx=0;idx<n;idx++)pin({kind:'pt',shape:i,idx});const m=sh.type==='poly'&&sh.arc?1:sh.type==='poly'&&sh.verts?(sh.open?n-1:n):0;for(let idx=0;idx<m;idx++){const r:SkRef={kind:'center',shape:i,idx};if(refValid(candidate.shapes,r))pin(r)}}
 try{
   const first=await solveFree(candidate.shapes,[...candidate.cons,...pins]);if(!first||first.conflict||!finite(first.shapes)||!targetValid(first.shapes as SketchShape[])||!fixedValid(first.shapes as SketchShape[]))return{ok:false,reason:'Existing dimensions or relations prevent the requested rigid move.'}
   const exact=first.shapes.map((sh,i)=>selected.has(i)?candidate.shapes[i]:sh) as SketchShape[],cons=applyRelationUpdates(candidate.cons,first),last=await solveFree(exact,cons)
   if(!last||last.conflict||!finite(last.shapes)||!targetValid(last.shapes as SketchShape[])||!fixedValid(last.shapes as SketchShape[]))return{ok:false,reason:'The requested move does not satisfy persistent sketch relations.'}
   const changed=!last.shapes.every((sh,i)=>sketchesNumericallyEqual(geometry(sh as SketchShape),geometry(original[i])))
   return{ok:true,changed,shapes:last.shapes.map((sh,i)=>selected.has(i)?candidate.shapes[i]:near(geometry(sh as SketchShape),geometry(original[i]))?original[i]:sh) as SketchShape[],cons:applyRelationUpdates(cons,last),dof:last.dof}
 }catch{return{ok:false,reason:'The sketch solver could not validate this move.'}}
}
