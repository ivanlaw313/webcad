import type {SketchShape} from '../store'
import type {SkCon,SkRef} from './freesolve'
import {buildCopyRelations,type CopyTransform} from './copyRelations'
import {planRectPattern,planCircularPattern} from './patternTransforms'

export type PatternConfig = {kind:'rectangular';nx:number;dx:number;ny:number;dy:number} | {kind:'circular';count:number;angle:number;cx:number;cy:number}
export type PatternInstance = {key:string;entityIds:string[];generatedConstraintIds:string[];dimensionNames:Record<string,string>}
export type SketchPattern = {version:1;id:string;sourceEntityIds:string[];sourceSlots?:number[];config:PatternConfig;instances:PatternInstance[]}
export type PatternDocument = {shapes:SketchShape[];cons:SkCon[];entityIds:string[];patterns:SketchPattern[]}
export type PatternCandidate = {ok:true;document:PatternDocument;indexMap:Record<number,number>;omitted:{id:string;reason:string}[]} | {ok:false;reason:string}
const fail=(reason:string):PatternCandidate=>({ok:false,reason})
const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
const remapCon=(c:SkCon,map:Map<number,number>):SkCon=>{
 const remap=(r:SkRef):SkRef=>'shape'in r?{...r,shape:map.get(r.shape)!}:r
 return {...c,a:remap(c.a),...(c.b?{b:remap(c.b)}:{}),...('c'in c&&c.c?{c:remap(c.c)}:{})}
}
function transforms(config:PatternConfig):{ok:true;items:{key:string;transform:CopyTransform}[]}|{ok:false;reason:string}{
 if(config.kind==='circular'){
  const p=planCircularPattern(config.count,config.angle,config.cx,config.cy)
  return p.ok?{ok:true,items:p.transforms.map((transform,i)=>({key:String(i+1),transform}))}:p
 }
 if(config.kind!=='rectangular')return {ok:false,reason:'Unsupported pattern kind.'}
 const p=planRectPattern(config.nx,config.dx,config.ny,config.dy)
 if(!p.ok)return p
 const keys:string[]=[];for(let i=0;i<config.nx;i++)for(let j=0;j<config.ny;j++)if(i||j)keys.push(`${i},${j}`)
 return {ok:true,items:p.transforms.map((transform,i)=>({key:keys[i],transform}))}
}
function validDocument(doc:PatternDocument):boolean{
 return doc.entityIds.length===doc.shapes.length&&doc.entityIds.every(id=>typeof id==='string'&&!!id)&&new Set(doc.entityIds).size===doc.entityIds.length&&new Set(doc.cons.map(c=>c.id)).size===doc.cons.length&&doc.cons.every(c=>refs(c).every(r=>!('shape'in r)||(Number.isInteger(r.shape)&&r.shape>=0&&r.shape<doc.shapes.length)))
}
/** Pure candidate generation only. A caller must solve and atomically adopt it. */
export function createPersistentPattern(input:PatternDocument,sourceIndices:number[],config:PatternConfig,idPrefix:string):PatternCandidate{
 if(!idPrefix||input.patterns.length)return fail('This first version supports one pattern only; nesting is not supported.')
 if(!sourceIndices.length||new Set(sourceIndices).size!==sourceIndices.length||sourceIndices.some(i=>!Number.isInteger(i)||i<0||i>=input.shapes.length))return fail('Pattern source selection is invalid.')
 const doc={...input,entityIds:input.entityIds.length?input.entityIds:input.shapes.map((_,i)=>`${idPrefix}:original:${i}`)}
 if(!validDocument(doc))return fail('Invalid or duplicate document entity/constraint identities.')
 return regenerate(doc,{version:1,id:idPrefix,sourceEntityIds:sourceIndices.map(i=>doc.entityIds[i]),config,instances:[]},config)
}
export function reconfigurePersistentPattern(doc:PatternDocument,id:string,config:PatternConfig):PatternCandidate{
 if(!validDocument(doc)||doc.patterns.length!==1||doc.patterns[0].id!==id||doc.patterns[0].version!==1)return fail('Missing pattern or unsupported nested pattern document.')
 if(doc.patterns[0].config.kind!==config.kind)return fail('Changing pattern kind requires an explicit new pattern.')
 return regenerate(doc,doc.patterns[0],config)
}
function regenerate(doc:PatternDocument,pattern:SketchPattern,config:PatternConfig):PatternCandidate{
 const planned=transforms(config);if(!planned.ok)return planned
 const sourceSlots=pattern.sourceSlots??pattern.sourceEntityIds.map((_,i)=>i)
 if(sourceSlots.length!==pattern.sourceEntityIds.length||sourceSlots.some(i=>!Number.isInteger(i)||i<0)||new Set(sourceSlots).size!==sourceSlots.length)return fail('Invalid stable pattern source slots.')
 const oldIds=new Set(pattern.instances.flatMap(i=>i.entityIds)),owned=new Set(pattern.instances.flatMap(i=>i.generatedConstraintIds))
 if(new Set(pattern.sourceEntityIds).size!==pattern.sourceEntityIds.length||!pattern.sourceEntityIds.length||pattern.sourceEntityIds.some(id=>!doc.entityIds.includes(id)||oldIds.has(id)))return fail('Missing source or nested instance source is unsupported.')
 if(oldIds.size!==pattern.instances.reduce((sum,i)=>sum+i.entityIds.length,0)||pattern.instances.some(i=>i.entityIds.length!==pattern.sourceEntityIds.length||i.entityIds.some((id,j)=>id!==`${pattern.id}:instance:${i.key}:${sourceSlots[j]}`))||[...oldIds].some(id=>!doc.entityIds.includes(id))||new Set(pattern.instances.map(i=>i.key)).size!==pattern.instances.length)return fail('Invalid pattern instance identities.')
 const allOwned=pattern.instances.flatMap(i=>i.generatedConstraintIds)
 if(new Set(allOwned).size!==allOwned.length||allOwned.some(id=>!doc.cons.some(c=>c.id===id))||pattern.instances.some(i=>i.generatedConstraintIds.some(id=>{const c=doc.cons.find(c=>c.id===id)!;return !id.startsWith(`${pattern.id}:instance:${i.key}:`)||refs(c).some(r=>'shape'in r&&!i.entityIds.includes(doc.entityIds[r.shape]))})))return fail('Invalid generated constraint ownership.')
 const kept=doc.entityIds.map((id,i)=>({id,i})).filter(x=>!oldIds.has(x.id)),baseShapes=kept.map(x=>doc.shapes[x.i]),entityIds=kept.map(x=>x.id),shapes=[...baseShapes]
 const sourceIndices=pattern.sourceEntityIds.map(id=>entityIds.indexOf(id)),baseMap=new Map(kept.map((x,i)=>[x.i,i]))
 const ordinary=doc.cons.filter(c=>!owned.has(c.id)),sourceCons=ordinary.filter(c=>refs(c).every(r=>!('shape'in r)||baseMap.has(r.shape))).map(c=>remapCon(c,baseMap))
 if(baseShapes.length+planned.items.length*sourceIndices.length>1000)return fail('Pattern exceeds 1000 generated/source entities.')
 const surviving=new Map(pattern.instances.map(i=>[i.key,i])),wantedKeys=new Set(planned.items.map(i=>i.key)),reserved=new Set(doc.cons.filter(c=>c.kind==='dim'&&c.name&&!owned.has(c.id)).map(c=>c.kind==='dim'?c.name!:''))
 for(const i of pattern.instances)if(wantedKeys.has(i.key))for(const name of Object.values(i.dimensionNames))reserved.add(name)
 const generated:SkCon[]=[],instances:PatternInstance[]=[],omitted=new Map<string,{id:string;reason:string}>()
 for(const {key,transform} of planned.items){
  const prior=surviving.get(key),ids=prior?.entityIds??sourceIndices.map((_,i)=>`${pattern.id}:instance:${key}:${sourceSlots[i]}`)
  if(ids.some(id=>entityIds.includes(id)))return fail('Generated entity identity collides with another shape.')
  const p=buildCopyRelations(baseShapes,sourceCons,sourceIndices,[transform],`${pattern.id}:instance:${key}`,[...reserved]);if(!p.ok)return p
  p.omitted.forEach(x=>omitted.set(x.id,x))
  const map=new Map(baseShapes.map((_,i)=>[i,i]));p.copyIndices.forEach((index,j)=>map.set(index,shapes.length+j))
  let cs=p.cons.slice(sourceCons.length).map(c=>remapCon(c,map))
  const rename=new Map<string,string>();for(const c of cs)if(c.kind==='dim'&&c.name&&prior?.dimensionNames[c.id])rename.set(c.name,prior.dimensionNames[c.id])
  cs=cs.map(c=>{if(c.kind!=='dim')return c;return {...c,...(c.name?{name:rename.get(c.name)??c.name}:{}),...(c.expr?{expr:c.expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g,n=>rename.get(n)??n)}:{}),...(c.refs?{refs:Object.fromEntries(Object.entries(c.refs).map(([n,id])=>[rename.get(n)??n,id]))}:{})}})
  const dimensionNames:Record<string,string>={};for(const c of cs)if(c.kind==='dim'&&c.name){dimensionNames[c.id]=c.name;reserved.add(c.name)}
  generated.push(...cs);shapes.push(...p.copyIndices.map(i=>p.shapes[i]));entityIds.push(...ids)
  instances.push({key,entityIds:[...ids],generatedConstraintIds:cs.map(c=>c.id),dimensionNames})
 }
 const indexMap:Record<number,number>={};doc.entityIds.forEach((id,i)=>{const next=entityIds.indexOf(id);if(next>=0)indexMap[i]=next})
 const finalMap=new Map(Object.entries(indexMap).map(([i,j])=>[Number(i),j])),nextGeneratedIds=new Set(generated.map(c=>c.id))
 for(const c of ordinary){
  if(refs(c).some(r=>'shape'in r&&!finalMap.has(r.shape)))return fail(`Cannot remove an instance referenced by constraint ${c.id}.`)
  if(c.kind==='dim'){
   const bound=Object.values(c.refs??{}).map(id=>id.startsWith('dimension:')?id.slice(10):id)
   const tokens:string[]=c.expr?.match(/[A-Za-z_][A-Za-z0-9_]*/g)??[]
   const removed=doc.cons.filter(x=>owned.has(x.id)&&!nextGeneratedIds.has(x.id))
   if(bound.some(id=>owned.has(id)&&!nextGeneratedIds.has(id))||removed.some(x=>x.kind==='dim'&&x.name&&tokens.includes(x.name)))return fail(`Cannot remove an instance dimension referenced by ${c.id}.`)
  }
 }
 const cons=[...ordinary.map(c=>remapCon(c,finalMap)),...generated]
 if(new Set(cons.map(c=>c.id)).size!==cons.length)return fail('Generated constraint identity collision.')
 const names=cons.filter(c=>c.kind==='dim'&&c.name).map(c=>c.kind==='dim'?c.name!:'')
 if(new Set(names).size!==names.length)return fail('Generated dimension name collision.')
 return {ok:true,document:{shapes,cons,entityIds,patterns:[{...pattern,sourceSlots:[...sourceSlots],config:structuredClone(config),instances}]},indexMap,omitted:[...omitted.values()]}
}
