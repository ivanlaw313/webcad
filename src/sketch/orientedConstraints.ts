import type {SketchPrimitive,Constraint} from '@salusoft89/planegcs'
type Pt=[number,number]
export function frameDirection(angle:number,vertical=false):Pt{const a=(angle+(vertical?90:0))*Math.PI/180;return[Math.cos(a),Math.sin(a)]}
export function orientedLinePrimitives(key:string,angle:number,vertical:boolean,lineId:string|null,pointIds:[string,string]|null,points?:[Pt,Pt]):(SketchPrimitive|Constraint)[]{
 const u=frameDirection(angle,vertical),origin=points?.[0]??[0,0],span=points?Math.max(1,Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1])):1,id=(s:string)=>`${key}:frame:${s}`,g:(SketchPrimitive|Constraint)[]=[{id:id('O'),type:'point',x:origin[0],y:origin[1],fixed:true},{id:id('U'),type:'point',x:origin[0]+span*u[0],y:origin[1]+span*u[1],fixed:true},{id:id('basis'),type:'line',p1_id:id('O'),p2_id:id('U')}]
 if(!lineId&&pointIds){lineId=id('edge');g.push({id:lineId,type:'line',p1_id:pointIds[0],p2_id:pointIds[1]})}
 if(lineId)g.push({id:key,type:'parallel',l1_id:lineId,l2_id:id('basis')} as Constraint)
 return g
}
export function orientedDistancePrimitives(key:string,angle:number,vertical:boolean,aId:string,bId:string,A:Pt,value:number):(SketchPrimitive|Constraint)[]{
 const u=frameDirection(angle,vertical),span=Math.max(1,Math.abs(value)*10),v:Pt=[-span*u[1],span*u[0]],id=(s:string)=>`${key}:frame:${s}`
 return[{id:id('aux'),type:'point',x:A[0]+v[0],y:A[1]+v[1],fixed:false},...(['x','y'] as const).map((prop,i)=>({id:id(prop),type:'difference',param1:{o_id:aId,prop},param2:{o_id:id('aux'),prop},difference:v[i]} as Constraint)),{id:id('normal'),type:'line',p1_id:aId,p2_id:id('aux')},value===0?{id:key,type:'point_on_line_pl',p_id:bId,l_id:id('normal')} as Constraint:{id:key,type:'p2l_distance',p_id:bId,l_id:id('normal'),distance:value} as Constraint]
}
