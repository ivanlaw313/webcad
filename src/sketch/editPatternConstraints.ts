import { patternDistanceSideError } from './patternDistanceSides'
import type { PatternDocument } from './persistentPatterns'
import { reconfigurePersistentPattern } from './persistentPatterns'
import { solvePatternCandidate } from './solvePatternCandidate'
import { solveMoveCandidate } from './moveRelations'
import { solveFree, refValid, refPts, measureDim, type SkCon, type SkRef } from './freesolve'
import { resolvePatternDimensions, type PatternDimensionOptions } from './resolvePatternDimensions'

const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
const remap=(c:SkCon,map:Map<number,number>):SkCon=>{
 const ref=(r:SkRef):SkRef=>'shape'in r?{...r,shape:map.get(r.shape)!}:r
 return {...c,a:ref(c.a),...(c.b?{b:ref(c.b)}:{}),...('c'in c&&c.c?{c:ref(c.c)}:{})}
}
export async function editPatternConstraints(input:PatternDocument,edit:{add?:SkCon[];removeIds?:string[]},options?:PatternDimensionOptions):Promise<Extract<Awaited<ReturnType<typeof solvePatternCandidate>>,{ok:true}>|{ok:false;reason:string;failureKind?:'conflict'}>{
 const fail=(reason:string)=>({ok:false as const,reason})
 if(input.patterns.length!==1)return fail('A single valid pattern is required.')
 let doc=structuredClone(input)
 const pattern=doc.patterns[0],validation=reconfigurePersistentPattern(doc,pattern.id,pattern.config)
 if(!validation.ok)return validation
 const generated=new Set(pattern.instances.flatMap(i=>i.entityIds)),owned=new Set(pattern.instances.flatMap(i=>i.generatedConstraintIds))
 const generatedIndices=new Set(doc.entityIds.flatMap((id,i)=>generated.has(id)?[i]:[]))
 const add=structuredClone(edit.add??[]),remove=new Set(edit.removeIds??[])
 if(new Set(add.map(c=>c.id)).size!==add.length||add.some(c=>!c.id||doc.cons.some(x=>x.id===c.id)))return fail('New source relations require unique IDs.')
 if([...remove].some(id=>owned.has(id)||!doc.cons.some(c=>c.id===id)))return fail('Generated relations are source controlled; edit the source or detach the pattern.')
 if(add.some(c=>refs(c).some(r=>'shape'in r&&(generatedIndices.has(r.shape)||!doc.shapes[r.shape]))))return fail('New relations must reference source/base geometry, not generated instances.')
 // Keep ordinary solver tangent branch selection from the original geometry;
 // no seed rewrite is allowed to redefine an implicit Fix anchor.
 for(const c of add)if(c.kind==='con'&&c.type==='tangent'){
  const circle=(r?:SkRef)=>{
   if(r?.kind!=='circle'||!refValid(doc.shapes,r))return false
   const sh=doc.shapes[r.shape]
   return sh.type==='circle'&&!sh.point&&Number.isFinite(sh.r)&&sh.r>0&&sh.c.every(Number.isFinite)
  }
  const line=(r?:SkRef)=>{
   if(r?.kind!=='edge'||!refValid(doc.shapes,r))return false
   const sh=doc.shapes[r.shape]
   if(sh.type==='circle'||sh.type==='poly'&&(sh.arc||sh.ell||sh.earc||sh.ctrl||Math.abs(sh.bulges?.[r.idx]??0)>1e-12))return false
   const [a,b]=refPts(doc.shapes,r)
   return !!a&&!!b&&a.every(Number.isFinite)&&b.every(Number.isFinite)&&Math.hypot(b[0]-a[0],b[1]-a[1])>1e-9
  }
  if(c.c||!c.b||'shape'in c.a&&'shape'in c.b&&c.a.shape===c.b.shape||!((circle(c.a)&&line(c.b))||(line(c.a)&&circle(c.b))||(circle(c.a)&&circle(c.b))))return fail('Pattern tangency currently supports distinct full circles with a straight base edge or another full circle; special curves require separate validation.')
 }
 for(const c of add)if(c.kind==='dim'){
  const pair=['dist','hdist','vdist'].includes(c.type),projection=c.type==='hdist'||c.type==='vdist'
  if(!['len','rad','dia','angle','arclen','dist','hdist','vdist','p2l'].includes(c.type)||!Number.isFinite(c.value)||(projection?c.value<0:c.value<=0)||(c.type==='angle'?c.value>=360||!c.b:pair||c.type==='p2l'?!c.b:!!c.b)||!c.name||c.expr||c.param||c.paramId||c.refs)return fail('New dimensions require supported numeric source references and positive values (horizontal/vertical projections may be zero).')
  if(c.frameAngleDeg!==undefined&&(!projection||!Number.isFinite(c.frameAngleDeg))||c.projectionSign!==undefined&&(!projection||![1,-1].includes(c.projectionSign)))return fail('Invalid projection frame or direction.')
  if(!('shape'in c.a)||!refValid(doc.shapes,c.a))return fail('New dimension requires a valid source geometry reference.')
  const sh=doc.shapes[c.a.shape]
  if(c.type==='p2l'){
   if(!c.b||!('shape'in c.b)||!['pt','center','ellipse-point','ellipse-arc-end'].includes(c.a.kind)||c.b.kind!=='edge'||!refValid(doc.shapes,c.b))return fail('Perpendicular distance needs a source/base point and straight edge.')
   const edge=doc.shapes[c.b.shape],points=refPts(doc.shapes,c.a),[a,b]=refPts(doc.shapes,c.b)
   if(edge.type==='circle'||edge.type==='poly'&&(edge.arc||edge.ell||edge.earc||edge.ctrl||Math.abs(edge.bulges?.[c.b.idx]??0)>1e-12)||points.length!==1||!a||!b||![...points[0],...a,...b].every(Number.isFinite)||Math.hypot(b[0]-a[0],b[1]-a[1])<=1e-9)return fail('Perpendicular distance needs finite points and a nonzero straight edge, not a curve chord.')
  }else if(pair){
   if(!c.b||JSON.stringify(c.a)===JSON.stringify(c.b))return fail('Point distance needs two distinct point references.')
   for(const r of [c.a,c.b]){
    if(!('shape'in r)||!['pt','center','ellipse-point','ellipse-arc-end'].includes(r.kind)||!refValid(doc.shapes,r))return fail('Point distance currently requires valid source/base geometry points.')
    const pts=refPts(doc.shapes,r)
    if(pts.length!==1||!pts[0].every(Number.isFinite))return fail('Point distance requires finite coordinates.')
   }
  }else if(c.type==='arclen'){
   const circular=c.a.kind==='edge'&&sh.type==='poly'&&!!sh.verts&&Math.abs(sh.bulges?.[c.a.idx]??0)>1e-12||c.a.kind==='circle'&&sh.type==='poly'&&!!sh.arc
   const measured=circular?measureDim(doc.shapes,c):null
   if(!circular||measured==null||!Number.isFinite(measured)||measured<=0)return fail('Arc length needs a valid nonzero circular arc, not a full circle, straight edge or ellipse.')
  }else if(c.type==='angle'){
   if(!c.b||c.a.kind!=='edge'||c.b.kind!=='edge'||c.a.shape===c.b.shape&&c.a.idx===c.b.idx)return fail('Angle needs two distinct straight edges.')
   for(const r of [c.a,c.b]){
    if(!refValid(doc.shapes,r))return fail('Angle reference is invalid.')
    const edge=doc.shapes[r.shape]
    if(edge.type==='circle'||edge.type==='poly'&&(edge.arc||edge.ell||edge.earc||edge.ctrl||Math.abs(edge.bulges?.[r.idx]??0)>1e-12))return fail('Angle supports straight edges only.')
    const [a,b]=refPts(doc.shapes,r)
    if(!a||!b||!a.every(Number.isFinite)||!b.every(Number.isFinite)||Math.hypot(b[0]-a[0],b[1]-a[1])<=1e-9)return fail('Angle needs nonzero finite edges.')
   }
  }else if(c.type==='len'){
   if(c.a.kind==='ellipse-axis'){
    const e=sh.type==='poly'?(sh.ell??sh.earc):null
    if(!e||![e.cx,e.cy,e.rx,e.ry,e.rot].every(Number.isFinite)||e.rx<=0||e.ry<=0)return fail('Ellipse semi-axis requires finite native ellipse geometry and positive local radii.')
   }else if(c.a.kind!=='edge'||sh.type==='circle'||sh.type==='poly'&&(sh.arc||sh.ell||sh.earc||sh.ctrl||Math.abs(sh.bulges?.[c.a.idx]??0)>1e-12))return fail('Length placement supports straight edges or native ellipse local semi-axes only.')
  }else if(!(c.a.kind==='circle'&&(sh.type==='circle'&&!sh.point||sh.type==='poly'&&!!sh.arc)||c.a.kind==='edge'&&sh.type==='poly'&&!!sh.verts&&Math.abs(sh.bulges?.[c.a.idx]??0)>1e-12))return fail('Radius/diameter placement requires a circle or circular arc.')
 }
 const removed=doc.cons.filter(c=>remove.has(c.id)),names=new Set(removed.flatMap(c=>c.kind==='dim'&&c.name?[c.name]:[])),paramNames=new Set(options?.parameters?.map(p=>p.name)??[])
 doc.cons=[...doc.cons.filter(c=>!remove.has(c.id)),...add]
 for(const c of doc.cons)if(c.kind==='dim'&&!owned.has(c.id)){
  if(Object.values(c.refs??{}).some(id=>remove.has(id.startsWith('dimension:')?id.slice(10):id))||(c.expr?.match(/[A-Za-z_一-龥][\w一-龥]*/g)??[]).some(t=>names.has(t)&&!c.refs?.[t]&&!paramNames.has(t)))return fail(`Surviving formula ${c.id} references a removed dimension.`)
 }
 const resolved=resolvePatternDimensions(doc,add.filter(c=>c.kind==='dim').map(c=>c.id),options)
 if(!resolved.ok)return resolved
 doc=resolved.document
 const affectedIds=new Set([...add.map(c=>c.id),...resolved.changedIds])
 const kept=doc.shapes.map((_,i)=>i).filter(i=>!generatedIndices.has(i)),toBase=new Map(kept.map((i,j)=>[i,j])),toFull=new Map(kept.map((i,j)=>[j,i]))
 const baseShapes=kept.map(i=>doc.shapes[i]),baseCons=doc.cons.filter(c=>!owned.has(c.id)&&refs(c).every(r=>!('shape'in r)||toBase.has(r.shape))).map(c=>remap(c,toBase))
 const touched=new Set(baseCons.filter(c=>affectedIds.has(c.id)).flatMap(c=>refs(c).flatMap(r=>'shape'in r?[r.shape]:[])))
 let changed=true
 while(changed){changed=false;for(const c of baseCons){const indices=refs(c).flatMap(r=>'shape'in r?[r.shape]:[]);if(indices.some(i=>touched.has(i)))for(const i of indices)if(!touched.has(i)){touched.add(i);changed=true}}}
 const solved=await solveMoveCandidate(baseShapes,{ok:true,shapes:structuredClone(baseShapes),cons:baseCons,selectedIndices:[],targetShapes:[]})
 if(!solved.ok){
  // Classify only an actual solver conflict, never a geometry/reference failure.
  if(add.some(c=>c.kind==='dim'&&!c.driven)){
   try{const probe=await solveFree(structuredClone(baseShapes),structuredClone(baseCons));if(probe?.conflict)return {ok:false,reason:solved.reason,failureKind:'conflict'}}catch{/* unknown solver failures remain unclassified */}
  }
  return fail(solved.reason)
 }
 const baseSideError=patternDistanceSideError({shapes:baseShapes,cons:baseCons},{shapes:solved.shapes,cons:solved.cons})
 if(baseSideError)return fail(baseSideError)
 // solveMoveCandidate returns original objects when numerically unchanged, including
 // equivalent canonicalized curves. Do not accept drift in disconnected base components.
 if(baseShapes.some((s,i)=>!touched.has(i)&&solved.shapes[i]!==s))return fail('Constraint solving moved unrelated geometry.')
 const sideBaseline=structuredClone(doc)
 kept.forEach((i,j)=>{doc.shapes[i]=solved.shapes[j]})
 const updated=new Map(solved.cons.map(c=>[c.id,remap(c,toFull)]))
 doc.cons=doc.cons.map(c=>updated.get(c.id)??c)
 const final=await solvePatternCandidate(doc,reconfigurePersistentPattern(doc,pattern.id,pattern.config))
 if(!final.ok)return final
 const finalSideError=patternDistanceSideError(sideBaseline,final.document)
 return finalSideError?fail(finalSideError):final
}
