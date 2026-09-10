import type { SketchShape } from '../store'
import type { PatternDocument } from './persistentPatterns'
import { reconfigurePersistentPattern } from './persistentPatterns'
import { solvePatternCandidate } from './solvePatternCandidate'
import { resolvePatternDimensions, type PatternDimensionOptions } from './resolvePatternDimensions'
import { pathPts, tessellateSeg } from './sketchOps'
import { degenerateSketchProfile } from './profileValidity'
import { sketchesNumericallyEqual } from './constrainedDrag'
import { refPts, type SkCon, type SkRef, type FPt } from './freesolve'
const ordinary=(s:SketchShape):s is Extract<SketchShape,{type:'poly'}>=>s.type==='poly'&&!s.arc&&!s.smooth&&!s.ctrl&&!s.bspline&&!s.conic&&!s.ell&&!s.earc
/** Delete a control vertex from a source polyline and the matching instance topology.
 * The newly connected edge is straight; unaffected indexed relations retain their IDs.
 * Analytic curves/splines and individually edited generated instances are not supported.
 */
export async function deletePatternVertex(input:PatternDocument,shapeIndex:number,vertexIndex:number,options?:PatternDimensionOptions):Promise<{ok:true;document:PatternDocument;indexMap:Record<number,number>;removedEntityIds:string[];removedConstraintIds:string[];dof:number}|{ok:false;reason:string}>{
 const fail=(reason:string)=>({ok:false as const,reason})
 if(input.patterns.length!==1)return fail('Vertex deletion requires one persistent pattern.')
 const pattern=input.patterns[0],valid=reconfigurePersistentPattern(input,pattern.id,pattern.config)
 if(!valid.ok)return valid
 const source=input.shapes[shapeIndex]
 if(!Number.isInteger(shapeIndex)||!source||!ordinary(source))return fail('Vertex deletion supports ordinary polylines, not analytic arcs or splines.')
 const id=input.entityIds[shapeIndex],generated=new Set(pattern.instances.flatMap(i=>i.entityIds))
 if(generated.has(id))return fail('Generated vertices are managed by the pattern; edit the source or detach it first.')
 if(source.projectLink)return fail('Detach linked projected geometry before changing its topology.')
 const vertices=source.verts??source.pts,n=vertices.length,open=!!source.open
 if(!open&&n>1&&Math.hypot(vertices[0][0]-vertices[n-1][0],vertices[0][1]-vertices[n-1][1])<1e-7)return fail('Duplicate closing vertex is unsupported; normalize the closed polyline before editing topology.')
 if(!Number.isInteger(vertexIndex)||vertexIndex<0||vertexIndex>=n||n-1<(open?2:3))return fail('Invalid vertex index or insufficient remaining polyline vertices.')
 const slot=pattern.sourceEntityIds.indexOf(id),affected=new Set([shapeIndex,...(slot>=0?pattern.instances.map(i=>input.entityIds.indexOf(i.entityIds[slot])):[])])
 const changedEdges=new Set<number>()
 if(vertexIndex>0)changedEdges.add(vertexIndex-1);else if(!open)changedEdges.add(n-1)
 if(vertexIndex<n-1||!open)changedEdges.add(vertexIndex)
 const doc=structuredClone(input)
 for(const index of affected){const s=doc.shapes[index]
  if(!s||!ordinary(s)||(s.verts??s.pts).length!==n||!!s.open!==open)return fail('Instance topology does not match its source.')
  const pts=(s.verts??s.pts).filter((_,i)=>i!==vertexIndex).map(p=>[...p] as FPt)
  if(pts.some(p=>!p.every(Number.isFinite))||pts.some((p,i)=>i<pts.length-1&&Math.hypot(p[0]-pts[i+1][0],p[1]-pts[i+1][1])<1e-7)||!open&&Math.hypot(pts[0][0]-pts.at(-1)![0],pts[0][1]-pts.at(-1)![1])<1e-7)return fail('Deleting this vertex creates a zero-length edge.')
  let next:SketchShape
  if(s.verts){
   const bulges=(s.bulges??Array(n).fill(0)).filter((_,i)=>i!==vertexIndex)
   if(bulges.length!==pts.length||bulges.some(v=>!Number.isFinite(v)))return fail('Invalid polyline arc data.')
   if(!open)bulges[(vertexIndex-1+pts.length)%pts.length]=0
   else if(vertexIndex>0&&vertexIndex<n-1)bulges[vertexIndex-1]=0
   if(open)bulges[pts.length-1]=0
   const samples=open?[pts[0],...pts.slice(0,-1).flatMap((p,i)=>tessellateSeg(p,pts[i+1],bulges[i]))]:pathPts(pts,bulges)
   next={...s,verts:pts,bulges,pts:samples}
  }else next={...s,pts}
  if(!open&&degenerateSketchProfile(next))return fail('Deleting this vertex creates a degenerate closed profile.')
  doc.shapes[index]=next
 }
 const remap=(r:SkRef):SkRef|null=>{
  if(!('shape'in r)||!affected.has(r.shape))return r
  if(r.kind==='pt')return r.idx===vertexIndex?null:{...r,idx:r.idx>vertexIndex?r.idx-1:r.idx}
  if(r.kind==='edge'||r.kind==='center')return changedEdges.has(r.idx)?null:{...r,idx:r.idx>vertexIndex?r.idx-1:r.idx}
  throw Error('Unsupported reference on edited polyline.')
 }
 const removedIds=new Set<string>(),cons:SkCon[]=[]
 try{for(const c of doc.cons){const a=remap(c.a),b=c.b?remap(c.b):undefined,cc='c'in c&&c.c?remap(c.c):undefined
  if(!a||b===null||cc===null){removedIds.add(c.id);continue}
  const next={...c,a,...(b?{b}:{}),...(cc?{c:cc}:{})}
  if(c.kind==='con'&&c.type==='fix'&&!sketchesNumericallyEqual(refPts(input.shapes,c.a),refPts(doc.shapes,a)))return fail(`Vertex deletion would move unaffected Fix ${c.id}.`)
  cons.push(next)
 }}catch{return fail('Polyline reference topology cannot be remapped safely.')}
 const removedNames=new Set(input.cons.flatMap(c=>removedIds.has(c.id)&&c.kind==='dim'&&c.name?[c.name]:[])),parameterNames=new Set(options?.parameters?.map(p=>p.name)??[])
 for(const c of cons)if(c.kind==='dim'){
  if(Object.values(c.refs??{}).some(id=>removedIds.has(id.startsWith('dimension:')?id.slice(10):id)))return fail(`Surviving formula ${c.id} references a removed dimension.`)
  if((c.expr?.match(/[A-Za-z_一-龥][\w一-龥]*/g)??[]).some(t=>removedNames.has(t)&&!c.refs?.[t]&&!parameterNames.has(t)))return fail(`Surviving formula ${c.id} references a removed dimension.`)
 }
 doc.cons=cons
 for(const instance of doc.patterns[0].instances){instance.generatedConstraintIds=instance.generatedConstraintIds.filter(id=>!removedIds.has(id));instance.dimensionNames=Object.fromEntries(Object.entries(instance.dimensionNames).filter(([id])=>!removedIds.has(id)))}
 const resolved=resolvePatternDimensions(doc,[],options)
 if(!resolved.ok)return resolved
 const solved=await solvePatternCandidate(resolved.document,reconfigurePersistentPattern(resolved.document,pattern.id,pattern.config))
 if(!solved.ok)return solved
 const indexMap:Record<number,number>={};input.entityIds.forEach((id,i)=>{indexMap[i]=solved.document.entityIds.indexOf(id)})
 return {ok:true,document:solved.document,indexMap,removedEntityIds:[],removedConstraintIds:[...removedIds],dof:solved.dof}
}
