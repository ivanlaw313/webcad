import type {SketchShape} from '../store'
import {type SkCon,type SkRef,type FPt,refPts} from './freesolve'
import {mapEllipseArc,ellipseArcSample} from './ellipseArcGeometry'
import {ellipseSample} from './ellipseGeometry'
import {solveMirrorCandidate} from './mirrorRelations'
export type CopyTransform={dx:number;dy:number;angleDeg:number;cx:number;cy:number}
export type CopyPlan={ok:true;shapes:SketchShape[];cons:SkCon[];copyIndices:number[];omitted:{id:string;reason:string}[];dimensionMaps:Record<string,string>[]} | {ok:false;reason:string}
const refs=(c:SkCon):SkRef[]=>[c.a,c.b,...('c'in c?[c.c]:[])].filter((r):r is SkRef=>!!r)
/** Rigid transform preserving analytical curve controls and indexed references. */
export function transformCopyShape(shape:SketchShape,t:CopyTransform):SketchShape{
 const a=t.angleDeg*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a),xf=(p:FPt):FPt=>[t.cx+(p[0]-t.cx)*cos-(p[1]-t.cy)*sin+t.dx,t.cy+(p[0]-t.cx)*sin+(p[1]-t.cy)*cos+t.dy],sh=structuredClone(shape)
 if(sh.type==='circle')return {...sh,c:xf(sh.c)}
 if(sh.type==='rect'){
   const pts:FPt[]=[sh.a,[sh.b[0],sh.a[1]],sh.b,[sh.a[0],sh.b[1]]]
   if(Math.abs(t.angleDeg%360)<1e-10)return {...sh,a:xf(sh.a),b:xf(sh.b)}
   return {type:'poly',pts:pts.map(xf),...(sh.construction?{construction:true}:{}),...('centerline'in sh&&sh.centerline?{centerline:true}:{})}
 }
 let result:SketchShape={...sh,pts:sh.pts.map(xf)}
 if(sh.ctrl)result.ctrl=sh.ctrl.map(xf)
 if(sh.arc)result.arc={a:xf(sh.arc.a),b:xf(sh.arc.b),m:xf(sh.arc.m)}
 if(sh.verts)result.verts=sh.verts.map(xf)
 if(sh.ell){const C=xf([sh.ell.cx,sh.ell.cy]);result.ell={...sh.ell,cx:C[0],cy:C[1],rot:sh.ell.rot+t.angleDeg};result.pts=ellipseSample(result.ell)}
 if(sh.earc){result.earc=mapEllipseArc(sh.earc,xf,1);result.pts=ellipseArcSample(result.earc)}
 // Independent copies must not impersonate the source's external projection link.
 delete result.projectLink;delete result.projectLinkIssue;delete result.projectLinkSource;if(result.projected)result.projected=false
 return result
}
export function buildCopyRelations(shapes:SketchShape[],cons:SkCon[],sourceIndices:number[],transforms:CopyTransform[],idPrefix:string,reservedNames:string[]=[]):CopyPlan{
 const selected=[...new Set(sourceIndices)],set=new Set(selected)
 if(!selected.length||selected.some(i=>!Number.isInteger(i)||!shapes[i])||!transforms.length||transforms.some(t=>Object.values(t).some(v=>!Number.isFinite(v))))return {ok:false,reason:'Copy requires valid selected shapes and finite rigid transforms.'}
 const included:SkCon[]=[],omitted:{id:string;reason:string}[]=[]
 for(const c of cons){const rs=refs(c),touch=rs.some(r=>'shape'in r&&set.has(r.shape));if(!touch)continue
   if(rs.some(r=>!('shape'in r)||!set.has(r.shape))){omitted.push({id:c.id,reason:'External geometry reference was not copied.'});continue}included.push(c)
 }
 const includedIds=new Set(included.map(c=>c.id)),includedNames=new Set(included.filter(c=>c.kind==='dim'&&c.name).map(c=>c.kind==='dim'?c.name!:'')),allDimensionNames=new Set(cons.filter(c=>c.kind==='dim'&&c.name).map(c=>c.kind==='dim'?c.name!:''))
 for(const c of included)if(c.kind==='dim'&&c.expr){const tokens=c.expr.match(/[A-Za-z_][A-Za-z0-9_]*/g)??[];if(tokens.some(x=>allDimensionNames.has(x)&&!includedNames.has(x)&&(!c.refs?.[x]||c.refs[x].startsWith('dimension:')||cons.some(d=>d.id===c.refs?.[x])))||Object.values(c.refs??{}).some(id=>{const raw=id.startsWith('dimension:')?id.slice(10):id;return cons.some(x=>x.id===raw)&&!includedIds.has(raw)}))return {ok:false,reason:'A copied formula references an uncopied dimension. Include its geometry before copying.'}}
 const out=[...shapes],next=[...cons],copyIndices:number[]=[],dimensionMaps:Record<string,string>[]=[],usedIds=new Set(cons.map(c=>c.id)),usedNames=new Set([...allDimensionNames,...reservedNames])
 const unique=(base:string,used:Set<string>)=>{let value=base,n=1;while(used.has(value))value=base+'_'+n++;used.add(value);return value}
 for(let k=0;k<transforms.length;k++){
   const t=transforms[k]
   const indexMap=new Map(selected.map((i,j)=>[i,out.length+j])),ids=new Map(included.map(c=>[c.id,unique(`${idPrefix}:${k}:${c.id}`,usedIds)])),names=new Map<string,string>()
   for(const c of included)if(c.kind==='dim'&&c.name)names.set(c.name,unique(`${c.name}_copy${k+1}`,usedNames))
   dimensionMaps.push(Object.fromEntries([...ids,...names]))
   for(const i of selected){const shape=out.length;copyIndices.push(shape);out.push(transformCopyShape(shapes[i],t));if(shapes[i].type==='rect'&&out[shape].type==='poly')for(let idx=0;idx<4;idx++){if(included.some(c=>c.kind==='con'&&(c.type==='h'||c.type==='v')&&c.a.kind==='edge'&&c.a.shape===i&&c.a.idx===idx))continue;next.push({id:unique(`${idPrefix}:${k}:rect${i}:${idx}`,usedIds),kind:'con',type:idx%2===0?'h':'v',frameAngleDeg:t.angleDeg,a:{kind:'edge',shape,idx}})}}
   const remap=(r:SkRef):SkRef=>'shape'in r?{...r,shape:indexMap.get(r.shape)!}:r
   for(const c of included){let clone:SkCon={...structuredClone(c),id:ids.get(c.id)!,a:remap(c.a),...(c.b?{b:remap(c.b)}:{}),...('c'in c&&c.c?{c:remap(c.c)}:{})}
     if(clone.kind==='dim'){
       if(clone.name)clone.name=names.get(clone.name)!
       const rewrite=(name:string)=>clone.kind==='dim'&&clone.refs?.[name]&&!clone.refs[name].startsWith('dimension:')&&!ids.has(clone.refs[name])?name:names.get(name)??name
       if(clone.expr)clone.expr=clone.expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g,rewrite)
       if(clone.refs)clone.refs=Object.fromEntries(Object.entries(clone.refs).map(([name,id])=>[rewrite(name),id.startsWith('dimension:')&&ids.has(id.slice(10))?'dimension:'+ids.get(id.slice(10)):ids.get(id)??id]))
     }
     if((clone.kind==='con'&&(clone.type==='h'||clone.type==='v')||clone.kind==='dim'&&(clone.type==='hdist'||clone.type==='vdist'))&&(t.angleDeg!==0||clone.frameAngleDeg!==undefined)){
       const oldFrame=clone.frameAngleDeg??0
       if(clone.kind==='dim'&&!clone.driven&&clone.projectionSign===undefined&&c.b){
         const A=refPts(shapes,c.a)[0],B=refPts(shapes,c.b)[0],a=(oldFrame+(clone.type==='vdist'?90:0))*Math.PI/180
         if(!A||!B)return {ok:false,reason:'Copied oriented dimension has invalid point references.'}
         clone.projectionSign=(B[0]-A[0])*Math.cos(a)+(B[1]-A[1])*Math.sin(a)<0?-1:1
       }
       clone.frameAngleDeg=oldFrame+t.angleDeg
     }
     if('tagPos'in clone&&Array.isArray(clone.tagPos)&&clone.tagPos.length===2){const [x,y]=clone.tagPos as number[],a=t.angleDeg*Math.PI/180;clone=Object.assign(clone,{tagPos:[t.cx+(x-t.cx)*Math.cos(a)-(y-t.cy)*Math.sin(a)+t.dx,t.cy+(x-t.cx)*Math.sin(a)+(y-t.cy)*Math.cos(a)+t.dy]})}
     next.push(clone)
   }
 }
 return {ok:true,shapes:out,cons:next,copyIndices,omitted,dimensionMaps}
}
/** Same exact-source protection and persistent-system validation used for associative mirror. */
export async function solveCopyCandidate(originalShapes:SketchShape[],candidate:{shapes:SketchShape[];cons:SkCon[]}){
 const r=await solveMirrorCandidate(originalShapes,candidate)
 return r.ok?r:{ok:false as const,reason:r.reason.replace(/mirror/gi,'copy')}
}
