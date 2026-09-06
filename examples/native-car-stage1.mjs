// Native procedural authoring seed. No mesh imports. Original six-spoke coupon is unchanged.
import {wheelRig} from './wheel-rig.mjs'
export function nativeCarStage1(options={}) {
 const d=wheelRig(options), p=Object.fromEntries(d.params.map(p=>[p.name,p.value]))
 const {Wheelbase:wb,WheelDiameter:wd,CarWidth:cw}=p, r=wd/2
 d.projectName='Native-Car-Stage1-INCOMPLETE'
 const add=(id,name,value,expr)=>d.params.push({id,name,value,expr,refs:Object.fromEntries(d.params.filter(p=>new RegExp(`\\b${p.name}\\b`).test(expr)).map(p=>[p.name,p.id])),unit:'mm'})
 d.params.find(p=>p.name==='WheelStart').value=cw/2;d.params.find(p=>p.name==='WheelStart').expr='CarWidth/2'
 d.params.find(p=>p.name==='BodyStart').value=cw/2-10;d.params.find(p=>p.name==='BodyStart').expr='CarWidth/2-10'
 add('car-front','FrontStation',-wb/2,'-Wheelbase/2'); add('car-axle','AxleHeight',r,'WheelDiameter/2')
 add('car-cabin-start','CabinStart',cw/2-20,'CarWidth/2-20'); add('car-cabin-depth','CabinDepth',cw-40,'CarWidth-40')
 let serial=100
 const pt=(shape=0,idx=0)=>({kind:'pt',shape,idx})
 const dim=(type,a,b,value,name,expr)=>({id:`sc${++serial}`,kind:'dim',type,a,...(b?{b}:{}),value,name,expr,refs:Object.fromEntries(d.params.filter(p=>new RegExp(`\\b${p.name}\\b`).test(expr)).map(p=>[p.name,p.id]))})
 const locate=(a,x,z,xExpr,zExpr,prefix)=>[dim('hdist',a,{kind:'origin'},Math.abs(x),`${prefix}X`,xExpr),dim('vdist',a,{kind:'origin'},Math.abs(z),`${prefix}Z`,zExpr)]
 for(const [id,s] of Object.entries(d.sketchSources)){
  s.plane='XZ';s.baseZ=id==='sk1'||id==='sk2'?cw/2:cw/2-10
  for(const sh of s.shapes){if(sh.c)sh.c=[sh.c[0]-wb/2,sh.c[1]+r];if(sh.a){sh.a=[sh.a[0]-wb/2,sh.a[1]+r];sh.b=[sh.b[0]-wb/2,sh.b[1]+r]}}
  s.cons=s.cons.flatMap(c=>c.type==='coincident'&&c.b?.kind==='origin'?locate(c.a,-wb/2,r,'Wheelbase/2','WheelDiameter/2',id+'Datum'):[c])
 }
 for(const f of d.features){
  if(f.type==='extrude'){
   f.plane='XZ';f.baseZ=f.sketchId==='sk1'||f.sketchId==='sk2'?cw/2:cw/2-10
   const q=f.profile;if(q.c)q.c=[q.c[0]-wb/2,-q.c[1]+r];if(q.a){q.a=[q.a[0]-wb/2,-q.a[1]+r];q.b=[q.b[0]-wb/2,-q.b[1]+r]}
  }
  if(f.type==='circPattern'){f.count=5;f.origin=[-wb/2,0,r];f.dir=[0,1,0]}
  if(f.type==='mirror')f.plane='XZ'
 }
 d.paramBindings['F5:origin.0']='FrontStation';d.paramBindings['F5:origin.2']='AxleHeight'
 // Native constrained polygon master body, extended past both wheel stations.
 const polygon=(coords,expressions,prefix)=>({type:'poly',pts:coords})
 const constrain=(coords,expressions,prefix)=>coords.flatMap((v,i)=>locate(pt(0,i),...v,...expressions[i],`${prefix}${i+1}`))
 const body=[[-wb/2-wd*.3,wd*.35],[wb/2+wd*.3,wd*.35],[wb/2+wd*.3,wd*.85],[wb*.25,wd],[-wb*.25,wd],[-wb/2-wd*.3,wd*.7]]
 const be=[['Wheelbase/2+WheelDiameter*.3','WheelDiameter*.35'],['Wheelbase/2+WheelDiameter*.3','WheelDiameter*.35'],['Wheelbase/2+WheelDiameter*.3','WheelDiameter*.85'],['Wheelbase*.25','WheelDiameter'],['Wheelbase*.25','WheelDiameter'],['Wheelbase/2+WheelDiameter*.3','WheelDiameter*.7']]
 d.sketchSources.sk3={name:'Body master silhouette',shapes:[polygon(body)],cons:constrain(body,be,'Body'),plane:'XZ',baseZ:cw/2-10,op:'new',height:cw-20}
 d.features.find(f=>f.id==='F8').profile={kind:'poly',pts:body}
 const cabin=[[-wb*.25,wd*.9],[-wb*.12,wd*1.35],[wb*.22,wd*1.35],[wb*.4,wd*.9]]
 const ce=[['Wheelbase*.25','WheelDiameter*.9'],['Wheelbase*.12','WheelDiameter*1.35'],['Wheelbase*.22','WheelDiameter*1.35'],['Wheelbase*.4','WheelDiameter*.9']]
 const window=[[-wb*.19,wd*1.02],[-wb*.09,wd*1.25],[wb*.19,wd*1.25],[wb*.29,wd*1.02]]
 const we=[['Wheelbase*.19','WheelDiameter*1.02'],['Wheelbase*.09','WheelDiameter*1.25'],['Wheelbase*.19','WheelDiameter*1.25'],['Wheelbase*.29','WheelDiameter*1.02']]
 for(const [sk,id,name,pts,expr,operation] of [['sk5','F11','Cabin master',cabin,ce,'join'],['sk6','F12','Window opening',window,we,'cut']]){
  d.sketchSources[sk]={name,shapes:[polygon(pts)],cons:constrain(pts,expr,sk),plane:'XZ',baseZ:cw/2-20,op:operation,height:cw-40}
  d.features.push({id,type:'extrude',sketchId:sk,profile:{kind:'poly',pts},plane:'XZ',baseZ:cw/2-20,height:cw-40,operation})
  d.paramBindings[`${id}:baseZ`]='CabinStart';d.paramBindings[`${id}:height`]='CabinDepth'
 }
 const distance=Math.max(wb+wd,cw)*2, target=[0,wd*.6,0]
 const view=(name,dir,up=[0,1,0])=>({name,pos:target.map((v,i)=>v+dir[i]*distance),target:[...target],up,zoom:2.8,projection:'ortho'})
 // CAD [x,y,z] -> renderer [x,z,-y]. Driver faces -X; left is -Y.
 d.viewBookmarks=[view('Front (-X)',[-1,0,0]),view('Rear (+X)',[1,0,0]),view('Left (-Y)',[0,0,1]),view('Right (+Y)',[0,0,-1]),view('Top (+Z)',[0,1,0],[0,0,-1]),view('Isometric',[-1,1,1])]
 return d
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const {writeFile}=await import('node:fs/promises');await writeFile(process.argv[2]||'Native-Car-Stage1.json',JSON.stringify(nativeCarStage1(),null,2)+'\n')
}
