import {solveFree,refPts,type FShape,type FPt,type SkRef,type SkCon,type FreeSolveResult} from './freesolve'
import {resolveConstraintAnchors,resolvePointProjectionAnchors,validConstraintEdge} from './constraintAnchors'
import {sketchesNumericallyEqual} from './constrainedDrag'
export type ConstrainedEdgeDragResult={ok:true;result:FreeSolveResult;targetEnds:[FPt,FPt];intendedEnds:[FPt,FPt];projection:'none'|'axis'|'fixed'}|{ok:false;reason:string}
const near=(a:FPt,b:FPt)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-5
/** Whole-edge pointer intent is rigid translation, never independent endpoint
 * movement. Numeric edits continue to use the ordinary strict constraint solver. */
export async function solveConstrainedEdgeDrag(shapes:FShape[],cons:SkCon[],ref:SkRef,intendedEnds:[FPt,FPt]):Promise<ConstrainedEdgeDragResult>{
 if(ref.kind==='edge'&&!validConstraintEdge(shapes,ref))return{ok:false,reason:'目标线段已不存在'}
 if(!intendedEnds.every(p=>p.every(Number.isFinite)))return{ok:false,reason:'拖動目標無效'}
 if(cons.some(c=>[c.a,c.b,'c'in c?c.c:undefined].some(r=>r?.kind==='edge'&&!validConstraintEdge(shapes,r))))return{ok:false,reason:'約束引用的線段已不存在'}
 const current=refPts(shapes,ref)
 if(current.length!==2)return{ok:false,reason:'请选择有效线段'}
 const old=current as [FPt,FPt],delta:FPt=[intendedEnds[0][0]-old[0][0],intendedEnds[0][1]-old[0][1]],secondDelta:FPt=[intendedEnds[1][0]-old[1][0],intendedEnds[1][1]-old[1][1]]
 if(!near(delta,secondDelta))return{ok:false,reason:'整條邊拖動必須保持長度和方向'}
 let targetEnds=structuredClone(intendedEnds),projection:'none'|'axis'|'fixed'='none'
 const sh='shape'in ref?shapes[ref.shape]:undefined
 const straight=ref.kind==='edge'&&validConstraintEdge(shapes,ref)&&sh&&(sh.type==='rect'||sh.type==='poly'&&!sh.arc&&!sh.smooth&&Math.abs(sh.bulges?.[ref.idx]??0)<1e-12)
 if(straight&&ref.kind==='edge'){
  const n=sh.type==='rect'?4:sh.type==='poly'?(sh.verts??sh.pts).length:0
  const refs:SkRef[]=[{kind:'pt',shape:ref.shape,idx:ref.idx},{kind:'pt',shape:ref.shape,idx:(ref.idx+1)%n}],anchors=resolveConstraintAnchors(shapes,cons),fixedDelta:(number|undefined)[]=[undefined,undefined]
  for(let i=0;i<2;i++){const a=anchors.point(refs[i]);for(const axis of [0,1] as const){const value=axis===0?a.x:a.y;if(value===undefined)continue;const d=value-old[i][axis];if(fixedDelta[axis]!==undefined&&Math.abs(fixedDelta[axis]!-d)>1e-6)return{ok:false,reason:'兩端約束不允許同一剛性平移'};fixedDelta[axis]=d}}
  const constraints:{normal:FPt;value:number}[]=[],projected=resolvePointProjectionAnchors(shapes,cons)
  for(let i=0;i<2;i++)for(const p of projected(refs[i]))constraints.push({normal:p.normal,value:p.value-old[i][0]*p.normal[0]-old[i][1]*p.normal[1]})
  for(const axis of[0,1] as const)if(fixedDelta[axis]!==undefined)constraints.push({normal:axis===0?[1,0]:[0,1],value:fixedDelta[axis]!})
  let d:FPt=[...delta]
  if(constraints.length){const candidates:FPt[]=constraints.map(c=>{const offset=c.value-delta[0]*c.normal[0]-delta[1]*c.normal[1];return[delta[0]+offset*c.normal[0],delta[1]+offset*c.normal[1]]});for(let i=0;i<constraints.length;i++)for(let j=i+1;j<constraints.length;j++){const a=constraints[i],b=constraints[j],det=a.normal[0]*b.normal[1]-a.normal[1]*b.normal[0];if(Math.abs(det)>1e-9)candidates.push([(a.value*b.normal[1]-a.normal[1]*b.value)/det,(a.normal[0]*b.value-a.value*b.normal[0])/det])}const valid=candidates.filter(p=>constraints.every(c=>Math.abs(p[0]*c.normal[0]+p[1]*c.normal[1]-c.value)<1e-7));if(!valid.length)return{ok:false,reason:'兩端定向約束沒有共同剛性平移'};valid.sort((a,b)=>Math.hypot(a[0]-delta[0],a[1]-delta[1])-Math.hypot(b[0]-delta[0],b[1]-delta[1]));d=valid[0]}

  targetEnds=[[old[0][0]+d[0],old[0][1]+d[1]],[old[1][0]+d[0],old[1][1]+d[1]]]
  projection=constraints.length&&!fixedDelta.some(v=>v!==undefined)?'axis':fixedDelta.every(v=>v!==undefined)?'fixed':fixedDelta.some(v=>v!==undefined)?'axis':'none'
 }
 let result:FreeSolveResult|null
 let seeded=structuredClone(shapes)
 if(straight&&ref.kind==='edge'){const s=seeded[ref.shape];if(s.type==='poly'){const ps=s.verts??s.pts,n=ps.length;ps[ref.idx]=[...targetEnds[0]];ps[(ref.idx+1)%n]=[...targetEnds[1]]}}
 // Fix stores its anchor implicitly in input geometry. Seeding must never
 // redefine it, including a shared endpoint or an adjacent arc's fixed center.
 for(const c of cons)if(c.kind==='con'&&c.type==='fix'){
  const before=refPts(shapes,c.a),after=refPts(seeded,c.a)
  if(!sketchesNumericallyEqual(before,after)){seeded=structuredClone(shapes);break}
 }
 try{result=await solveFree(seeded,structuredClone(cons),{ref,ends:targetEnds})}catch{return{ok:false,reason:'整條邊約束求解失敗'}}
 const actual=result?refPts(result.shapes,ref):[]
 const finite=(v:unknown):boolean=>typeof v==='number'?Number.isFinite(v):Array.isArray(v)?v.every(finite):v!==null&&typeof v==='object'?Object.values(v).every(finite):true
 if(!result||result.conflict||!result.shapes.every(finite)||actual.length!==2||!near(actual[0],targetEnds[0])||!near(actual[1],targetEnds[1]))return{ok:false,reason:'其他尺寸或关系阻止整条边平移'}
 if(sketchesNumericallyEqual(result.shapes,shapes))result={...result,shapes:structuredClone(shapes)}
 return{ok:true,result,targetEnds,intendedEnds:structuredClone(intendedEnds),projection}
}
