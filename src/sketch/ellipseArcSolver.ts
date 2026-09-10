import type { SketchPrimitive, Constraint, SketchGeometry } from '@salusoft89/planegcs'
import {ellipseControlPoints,ellipseFromControls} from './ellipseGeometry'
import {ellipseArcPoint,ellipseArcSweep,ellipseArcWithSweep,type EllipseArcGeometry} from './ellipseArcGeometry'
type Pt=[number,number]
type Primitive=SketchPrimitive|Constraint
export const ellipseArcPointId=(i:number,j:number)=>`ea${i}_end${j}`
const supportId=(i:number,j:number)=>`p${i}_${j}`
const inner=(i:number,key:string)=>`ea${i}_${key}`
export function ellipseArcPrimitives(i:number,e:EllipseArcGeometry,fixed:Set<string>=new Set()):Primitive[]{
 const id=(key:string)=>key==='C'?supportId(i,0):key==='U'?supportId(i,1):key==='V'?supportId(i,2):key==='E0'?ellipseArcPointId(i,0):key==='E1'?ellipseArcPointId(i,1):inner(i,key)
 const point=(key:string,p:Pt)=>({id:id(key),type:'point',x:p[0],y:p[1],fixed:fixed.has(id(key))} as SketchPrimitive)
 const line=(key:string,a:string,b:string)=>({id:key==='CU'?`l${i}_0`:key==='CV'?`l${i}_1`:id(key),type:'line',p1_id:id(a),p2_id:id(b)} as SketchPrimitive)
 const lineId=(key:string)=>key==='CU'?`l${i}_0`:key==='CV'?`l${i}_1`:id(key)
 const on=(key:string,p:string,c:string)=>({id:id(key),type:'point_on_circle',p_id:id(p),c_id:id(c)} as Constraint)
 const difference=(key:string,a:string,b:string,d:string,prop:'x'|'y')=>({id:id(key),type:'difference',param1:{o_id:id(a),prop},param2:{o_id:id(b),prop},difference:{o_id:id(d),prop}} as Constraint)
 const [C,U,V]=ellipseControlPoints(e),du:Pt=[U[0]-C[0],U[1]-C[1]],dv:Pt=[V[0]-C[0],V[1]-C[1]],world=(x:number,y:number):Pt=>[C[0]+x*du[0]/e.rx+y*dv[0]/e.ry,C[1]+x*du[1]/e.rx+y*dv[1]/e.ry]
 const g:Primitive[]=[point('C',C),point('U',U),point('V',V),line('CU','C','U'),line('CV','C','V'),{id:id('perp'),type:'perpendicular_ll',l1_id:lineId('CU'),l2_id:lineId('CV')} as Constraint,{id:id('rx'),type:'circle',c_id:id('C'),radius:e.rx} as SketchPrimitive,{id:id('ry'),type:'circle',c_id:id('C'),radius:e.ry} as SketchPrimitive,on('onU','U','rx'),on('onV','V','ry'),point('DU',du),point('DV',dv)]
 for(const prop of ['x','y'] as const)g.push(difference('du'+prop,'C','U','DU',prop),difference('dv'+prop,'C','V','DV',prop))
 for(const j of [0,1]){const t=(e.a0+(j?ellipseArcSweep(e):0))*Math.PI/180,P=world(e.rx*Math.cos(t),e.rx*Math.sin(t)),Q=world(e.ry*Math.cos(t),e.ry*Math.sin(t));g.push(point('P'+j,P),point('Q'+j,Q),point('E'+j,ellipseArcPoint(e,t*180/Math.PI)),line('CP'+j,'C','P'+j),line('CQ'+j,'C','Q'+j),point('T'+j,[P[0]+dv[0],P[1]+dv[1]]),point('W'+j,[Q[0]+du[0],Q[1]+du[1]]),line('PT'+j,'P'+j,'T'+j),line('QW'+j,'Q'+j,'W'+j),on('onP'+j,'P'+j,'rx'),on('onQ'+j,'Q'+j,'ry'),{id:id('phase'+j),type:'parallel',l1_id:id('CP'+j),l2_id:id('CQ'+j)} as Constraint,{id:id('projectP'+j),type:'point_on_line_pl',p_id:id('E'+j),l_id:id('PT'+j)} as Constraint,{id:id('projectQ'+j),type:'point_on_line_pl',p_id:id('E'+j),l_id:id('QW'+j)} as Constraint);for(const prop of ['x','y'] as const)g.push(difference('t'+j+prop,'P'+j,'T'+j,'DV',prop),difference('w'+j+prop,'Q'+j,'W'+j,'DU',prop))}
 if(Math.abs(Math.abs(ellipseArcSweep(e))-360)<1e-8)g.push({id:id('fullTurn'),type:'p2p_coincident',p1_id:id('E0'),p2_id:id('E1')} as Constraint)
 return g
}
export function decodeEllipseArc(i:number,previous:EllipseArcGeometry,geometry:SketchGeometry[]):EllipseArcGeometry|null{
 const map=new Map(geometry.map(g=>[String(g.id),g])),point=(id:string):Pt|null=>{const p=map.get(id);return p?.type==='point'&&Number.isFinite(p.x)&&Number.isFinite(p.y)?[p.x,p.y]:null},C=point(supportId(i,0)),U=point(supportId(i,1)),V=point(supportId(i,2));if(!C||!U||!V)return null
 const support=ellipseFromControls([C,U,V],previous);if(!support||support.rx<=1e-8||support.ry<=1e-8)return null
 const rxPrimitive=map.get(inner(i,'rx')),ryPrimitive=map.get(inner(i,'ry'));if(rxPrimitive?.type!=='circle'||ryPrimitive?.type!=='circle'||rxPrimitive.radius<=1e-8||ryPrimitive.radius<=1e-8||Math.abs(rxPrimitive.radius-support.rx)>1e-7||Math.abs(ryPrimitive.radius-support.ry)>1e-7)return null
 const ux=(U[0]-C[0])/support.rx,uy=(U[1]-C[1])/support.rx,angles:number[]=[]
 for(const j of [0,1]){const E=point(ellipseArcPointId(i,j)),P=point(inner(i,'P'+j)),Q=point(inner(i,'Q'+j));if(!E||!P||!Q)return null;const x=((E[0]-C[0])*ux+(E[1]-C[1])*uy)/support.rx,y=(-(E[0]-C[0])*uy+(E[1]-C[1])*ux)/support.ry,phase=((P[0]-C[0])*(Q[0]-C[0])+(P[1]-C[1])*(Q[1]-C[1]))/(support.rx*support.ry);if(Math.abs(x*x+y*y-1)>1e-7||Math.abs(phase-1)>1e-7)return null;const raw=Math.atan2(y,x)*180/Math.PI,old=previous.a0+(j?ellipseArcSweep(previous):0);angles.push(raw+360*Math.round((old-raw)/360))}
 const oldSweep=ellipseArcSweep(previous);if(Math.abs(Math.abs(oldSweep)-360)<1e-8){const A=point(ellipseArcPointId(i,0)),B=point(ellipseArcPointId(i,1));if(!A||!B||Math.hypot(A[0]-B[0],A[1]-B[1])>1e-7)return null;return {...previous,...support,...ellipseArcWithSweep({...previous,...support},angles[0],Math.sign(oldSweep)*360)}}
 let sweep=angles[1]-angles[0];if(oldSweep>0){while(sweep<=0)sweep+=360;while(sweep>360)sweep-=360}else{while(sweep>=0)sweep-=360;while(sweep< -360)sweep+=360}if(Math.abs(Math.abs(oldSweep)-360)<1e-8&&(Math.abs(sweep)<1e-7||Math.abs(Math.abs(sweep)-360)<1e-7))sweep=Math.sign(oldSweep)*360;try{return {...previous,...support,...ellipseArcWithSweep({...previous,...support},angles[0],sweep)}}catch{return null}
}
/** Safe native seed: all original fixed primitive coordinates remain unchanged. */
export function seedEllipseArc(i:number,target:EllipseArcGeometry,prims:Primitive[]):void{
 const seeds=new Map(ellipseArcPrimitives(i,target).map(p=>[String(p.id),p]));for(const p of prims){const q=seeds.get(String(p.id));if(p.type==='point'&&!p.fixed&&q?.type==='point'){p.x=q.x;p.y=q.y}}
}
