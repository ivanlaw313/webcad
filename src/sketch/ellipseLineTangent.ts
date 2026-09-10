import type {SketchPrimitive,Constraint,SketchGeometry} from '@salusoft89/planegcs'
import type {EllipseGeometry} from './ellipseGeometry'
import {ellipseArcWithSweep} from './ellipseArcGeometry'
import {ellipseArcPrimitives} from './ellipseArcSolver'
import {ellipseArcTangentPrimitives} from './ellipseArcTangent'
export type EllipseContact={version:1;angleDeg:number}
type Primitive=SketchPrimitive|Constraint
const owned=(i:number,key:string,id:string)=>id.startsWith(`ea${i}_`)||id.startsWith(`${key}:`)?`${key}:general:${id}`:id
export function ellipseLineTangentPrimitives(i:number,e:EllipseGeometry,contact:EllipseContact,lineId:string,linePoints:[string,string],key:string):Primitive[]{
 const arc=ellipseArcWithSweep(e,contact.angleDeg,90),skip=new Set([`p${i}_0`,`p${i}_1`,`p${i}_2`,`l${i}_0`,`l${i}_1`,`ea${i}_perp`]),end1=new Set(['end1','P1','Q1','T1','W1','CP1','CQ1','PT1','QW1','onP1','onQ1','phase1','projectP1','projectQ1','t1x','t1y','w1x','w1y'].map(s=>`ea${i}_${s}`))
 const prims=[...ellipseArcPrimitives(i,arc).filter(p=>!skip.has(String(p.id))&&!end1.has(String(p.id))),...ellipseArcTangentPrimitives(i,arc,0,lineId,linePoints,0,key).map(p=>p.id===key+':contact'?{id:p.id,type:'point_on_line_pl',p_id:`ea${i}_end0`,l_id:lineId} as Constraint:p)]
 const rename=(v:unknown):unknown=>typeof v==='string'?owned(i,key,v):Array.isArray(v)?v.map(rename):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,rename(x)])):v
 return prims.map(p=>rename(p) as Primitive)
}
export function decodeEllipseLineContact(i:number,e:EllipseGeometry,previous:EllipseContact,linePoints:[string,string],key:string,geometry:SketchGeometry[]):EllipseContact|null{
 const map=new Map(geometry.map(g=>[String(g.id),g])),pt=(id:string):[number,number]|null=>{const p=map.get(owned(i,key,id));return p?.type==='point'&&Number.isFinite(p.x)&&Number.isFinite(p.y)?[p.x,p.y]:null},E=pt(`ea${i}_end0`),P=pt(`ea${i}_P0`),Q=pt(`ea${i}_Q0`),R=pt(key+':R'),S=pt(key+':S'),A=pt(linePoints[0]),B=pt(linePoints[1]);if(!E||!P||!Q||!R||!S||!A||!B)return null
 const rot=e.rot*Math.PI/180,u=Math.cos(rot),v=Math.sin(rot),x=((E[0]-e.cx)*u+(E[1]-e.cy)*v)/e.rx,y=(-(E[0]-e.cx)*v+(E[1]-e.cy)*u)/e.ry,phase=((P[0]-e.cx)*(Q[0]-e.cx)+(P[1]-e.cy)*(Q[1]-e.cy))/(e.rx*e.ry),cross=(p:[number,number],q:[number,number],r:number)=>((p[0]-e.cx)*(q[1]-e.cy)-(p[1]-e.cy)*(q[0]-e.cx))/(r*r)
 if(Math.abs(x*x+y*y-1)>1e-7||Math.abs(phase-1)>1e-7||Math.abs(cross(P,R,e.rx)-1)>1e-7||Math.abs(cross(Q,S,e.ry)-1)>1e-7)return null
 const raw=Math.atan2(y,x),dx=-e.rx*Math.sin(raw)*u-e.ry*Math.cos(raw)*v,dy=-e.rx*Math.sin(raw)*v+e.ry*Math.cos(raw)*u,lx=B[0]-A[0],ly=B[1]-A[1],len=Math.hypot(lx,ly)
 if(len<1e-8||Math.abs((E[0]-A[0])*ly-(E[1]-A[1])*lx)/len>1e-7||Math.abs(dx*ly-dy*lx)/(len*Math.hypot(dx,dy))>1e-7)return null
 const degrees=raw*180/Math.PI;return {version:1,angleDeg:degrees+360*Math.round((previous.angleDeg-degrees)/360)}
}
