import type { SketchShape } from '../store'
import type { PatternCandidate, PatternDocument } from './persistentPatterns'
import { applyRelationUpdates, arcResample, refPts, refValid, solveFree, type SkCon, type SkRef } from './freesolve'
import { ellipseControlPoints } from './ellipseGeometry'
import { ellipseArcPoint, ellipseArcSweep } from './ellipseArcGeometry'

const finite = (x: unknown): boolean => typeof x === 'number' ? Number.isFinite(x) : Array.isArray(x) ? x.every(finite) : !!x && typeof x === 'object' ? Object.values(x).every(finite) : true
const same = (a: unknown, b: unknown): boolean => typeof a === 'number' && typeof b === 'number' ? Math.abs(a-b) <= 1e-7 : Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v,i)=>same(v,b[i])) : a === b
function geometry(s: SketchShape): unknown {
 if(s.type==='circle')return [s.type,s.c,s.r]
 if(s.type==='rect')return [s.type,s.a,s.b]
 if(s.earc)return [ellipseControlPoints(s.earc),ellipseArcPoint(s.earc,s.earc.a0),ellipseArcPoint(s.earc,s.earc.a0+ellipseArcSweep(s.earc)),ellipseArcSweep(s.earc)]
 if(s.ell)return ellipseControlPoints(s.ell)
 if(s.arc)return arcResample(s.arc.a,s.arc.b,s.arc.m,24)
 return [s.ctrl??s.verts??s.pts,s.bulges]
}
const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
function fixedGeometry(shapes:SketchShape[],r:SkRef):unknown {
 if(!('shape'in r))return refPts(shapes,r)
 const s=shapes[r.shape]
 if(r.kind==='circle'||r.kind==='ellipse'||r.kind==='ellipse-arc'||r.kind==='edge'&&s.type==='poly'&&s.arc)return geometry(s)
 // Curved polyline edge Fix also locks the segment radius through its bulge.
 return [refPts(shapes,r),r.kind==='edge'&&s.type==='poly'?s.bulges?.[r.idx]:undefined]
}
/** Isolated regeneration transaction. Source must already be solved; no store/history writes.
 * Dimension/user-parameter values must already be resolved. Existing solveFree reference
 * geometry must be configured by the caller; this helper does not own global reference state.
 * Only geometry connected to generated instances may move. Source, instances and unrelated
 * geometry remain exact. The caller must route every later edit through a document coordinator.
 */
export async function solvePatternCandidate(prior:PatternDocument,candidate:PatternCandidate):Promise<({ok:true;document:PatternDocument;dof:number;indexMap:Record<number,number>;omitted:{id:string;reason:string}[]})|{ok:false;reason:string}> {
 if(!candidate.ok)return candidate
 const fail=(reason:string)=>({ok:false as const,reason})
 const doc=structuredClone(candidate.document)
 if(doc.patterns.length!==1||!finite(doc.shapes))return fail('Invalid pattern candidate geometry.')
 if([prior,doc].some(d=>d.cons.some(c=>refs(c).some(r=>!refValid(d.shapes,r)))))return fail('Pattern contains an invalid constraint reference.')
 const p=doc.patterns[0],source=new Set(p.sourceEntityIds),instances=new Set(p.instances.flatMap(i=>i.entityIds))
 const oldGenerated=new Set(prior.patterns.flatMap(p=>p.instances.flatMap(i=>i.entityIds)))
 // Candidate generation must not pre-move the external geometry to hide a conflict.
 for(let i=0;i<prior.shapes.length;i++){
  const j=candidate.indexMap[i]
  if(oldGenerated.has(prior.entityIds[i]))continue
  if(j===undefined||!doc.shapes[j]||!same(geometry(prior.shapes[i]),geometry(doc.shapes[j])))return fail('Candidate changed original geometry before constraint solving.')
 }
 for(const c of prior.cons)if(c.kind==='con'&&c.type==='fix'){
  if(prior.patterns.some(p=>p.instances.some(i=>i.generatedConstraintIds.includes(c.id))))continue
  const next=doc.cons.find(n=>n.id===c.id)
  if(!next||next.kind!=='con'||next.type!=='fix'||!same(fixedGeometry(prior.shapes,c.a),fixedGeometry(doc.shapes,next.a)))return fail(`Pattern conflicts with original Fix ${c.id}.`)
 }
 const movable=new Set(doc.entityIds.map((id,i)=>instances.has(id)?i:-1).filter(i=>i>=0))
 let changed=true
 while(changed){changed=false;for(const c of doc.cons){const indices=refs(c).flatMap(r=>'shape'in r?[r.shape]:[]);if(indices.some(i=>movable.has(i)))for(const i of indices)if(!movable.has(i)&&!source.has(doc.entityIds[i])){movable.add(i);changed=true}}}
 const protectedIndices=doc.entityIds.map((id,i)=>source.has(id)||instances.has(id)||!movable.has(i)?i:-1).filter(i=>i>=0)
 const pins:SkCon[]=[],used=new Set(doc.cons.map(c=>c.id))
 const pin=(a:SkRef)=>{let id=`pattern-temporary-pin:${pins.length}`;while(used.has(id))id+='_';used.add(id);pins.push({id,kind:'con',type:'fix',a})}
 for(const shape of protectedIndices){const s=doc.shapes[shape]
  if(s.type==='circle'){pin(s.point?{kind:'pt',shape,idx:0}:{kind:'circle',shape});continue}
  if(s.type==='poly'&&(s.ell||s.earc)){pin({kind:s.earc?'ellipse-arc':'ellipse',shape});continue}
  const n=s.type==='rect'?4:s.arc?2:(s.ctrl??s.verts??s.pts).length
  for(let idx=0;idx<n;idx++)if(refValid(doc.shapes,{kind:'pt',shape,idx}))pin({kind:'pt',shape,idx})
  const count=s.type==='poly'&&s.arc?1:s.type==='poly'&&s.verts?(s.open?n-1:n):0
  for(let idx=0;idx<count;idx++)if(refValid(doc.shapes,{kind:'center',shape,idx}))pin({kind:'center',shape,idx})
 }
 const fixedUnchanged=(shapes:SketchShape[])=>prior.cons.every(c=>{
  if(c.kind!=='con'||c.type!=='fix'||prior.patterns.some(p=>p.instances.some(i=>i.generatedConstraintIds.includes(c.id))))return true
  const next=doc.cons.find(n=>n.id===c.id)
  return !!next&&same(fixedGeometry(prior.shapes,c.a),fixedGeometry(shapes,next.a))
 })
 const protectedUnchanged=(shapes:SketchShape[])=>shapes.length===doc.shapes.length&&protectedIndices.every(i=>same(geometry(doc.shapes[i]),geometry(shapes[i])))
 try {
  const solved=await solveFree(doc.shapes,[...doc.cons,...pins])
  if(!solved||solved.conflict||!finite(solved.shapes)||!protectedUnchanged(solved.shapes as SketchShape[])||!fixedUnchanged(solved.shapes as SketchShape[]))return fail('Pattern placement conflicts with existing geometry or dimensions.')
  const shapes=solved.shapes.map((s,i)=>protectedIndices.includes(i)?doc.shapes[i]:s) as SketchShape[]
  const cons=applyRelationUpdates(doc.cons,solved)
  const checked=await solveFree(shapes,cons)
  if(!checked||checked.conflict||!finite(checked.shapes)||!protectedUnchanged(checked.shapes as SketchShape[])||!fixedUnchanged(checked.shapes as SketchShape[]))return fail('Persistent constraints cannot retain the regenerated pattern positions.')
  return {ok:true,document:{...doc,shapes:checked.shapes.map((s,i)=>protectedIndices.includes(i)?doc.shapes[i]:s) as SketchShape[],cons:applyRelationUpdates(cons,checked)},dof:checked.dof,indexMap:{...candidate.indexMap},omitted:structuredClone(candidate.omitted)}
 }catch{return fail('The sketch solver could not validate the pattern transaction.')}
}
