import {computeRefGeo,type RefGeo,type FShape,type FPt} from './freesolve'
import {arbitraryPlaneSection} from '../geom/arbitraryPlaneSection'
type V3=[number,number,number]
export type SourceReferenceMesh={vertices:ArrayLike<number>;triangles:ArrayLike<number>}|null
export type SourceReferenceSpec={plane:'XY'|'XZ'|'YZ';baseZ?:number;arb?:{o:V3;xd:V3;n:V3}|null;shapes:(FShape & {projectLink?:string})[]}
/** Pure reconstruction matching sketch reopen; does not change the active reference registry.
 * Caller supplies the source's upstream mesh. Array indices are NOT persistent topology identities:
 * changing mesh topology/order requires explicit reference remapping or ambiguity rejection.
 */
export function sourceReferenceGeometry(mesh:SourceReferenceMesh,source:SourceReferenceSpec,cpoints:V3[]=[]):RefGeo|null{
 // Existing arbitrary-plane reopen does not append construction points or filter own geometry.
 if(source.arb)return arbitraryPlaneSection(mesh,source.arb)
 const {plane}=source,off=source.baseZ??0
 let geo=computeRefGeo(mesh,plane,off)
 const map=(x:number,y:number,z:number):V3=>plane==='XZ'?[x,z,y]:plane==='YZ'?[-y,z,x]:[x,-y,z]
 const key=(p:FPt)=>`${Math.round(p[0]*50)},${Math.round(p[1]*50)}`
 const seen=new Set((geo?.pts??[]).map(key)),extra:FPt[]=[]
 const add=(st:V3)=>{if(Math.abs(st[2]-off)>.15)return;const p:FPt=[st[0],st[1]],k=key(p);if(seen.has(k))return;seen.add(k);extra.push(p)}
 for(const p of cpoints)add(map(...p))
 if(mesh)for(let i=0;i+2<mesh.vertices.length&&extra.length<200;i+=3)add(map(mesh.vertices[i],mesh.vertices[i+1],mesh.vertices[i+2]))
 if(extra.length)geo={pts:[...(geo?.pts??[]),...extra].slice(0,400),segs:geo?.segs??[]}
 if(!geo)return null
 const own:FPt[]=[]
 for(const sh of source.shapes){
  if(sh.type==='rect'){const [ax,ay]=sh.a,[bx,by]=sh.b;own.push([ax,ay],[bx,by],[ax,by],[bx,ay])}
  else if(sh.type==='circle')own.push(sh.c)
  else if(sh.projectLink!=='all')own.push(...sh.pts)
 }
 const near=(q:FPt)=>own.some(p=>(p[0]-q[0])**2+(p[1]-q[1])**2<.0025)
 return {pts:geo.pts.filter(p=>!near(p)),segs:geo.segs.filter(([a,b])=>!(near(a)&&near(b)))}
}
