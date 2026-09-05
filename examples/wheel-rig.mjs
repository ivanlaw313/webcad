// Native WebCAD feature seed; no mesh/GLB imports. Coordinates are abstract stations A/B.
export function wheelRig({Wheelbase=120,WheelDiameter=50,CarWidth=90}={}) {
 const params=[{id:'rig-wb',name:'Wheelbase',value:Wheelbase,unit:'mm'},{id:'rig-wd',name:'WheelDiameter',value:WheelDiameter,unit:'mm'},{id:'rig-cw',name:'CarWidth',value:CarWidth,unit:'mm'},
 {id:'rig-wz',name:'WheelStart',value:CarWidth/2-8,expr:'CarWidth/2-8',refs:{CarWidth:'rig-cw'},unit:'mm'},
 {id:'rig-bz',name:'BodyStart',value:-(CarWidth/2-10),expr:'-(CarWidth/2-10)',refs:{CarWidth:'rig-cw'},unit:'mm'},
 {id:'rig-bh',name:'BodyDepth',value:CarWidth-20,expr:'CarWidth-20',refs:{CarWidth:'rig-cw'},unit:'mm'}]
 let n=0;const C=(type,a,b)=>({id:`sc${++n}`,kind:'con',type,a,...(b?{b}:{})});
 const D=(type,a,value,name,expr,refs)=>({id:`sc${++n}`,kind:'dim',type,a,value,name,expr,refs})
 const circle=(i)=>({kind:'circle',shape:i});const point=(i,j=0)=>({kind:'pt',shape:i,idx:j}); const edge=(i,j)=>({kind:'edge',shape:i,idx:j});
 const anchored=(i)=>C('coincident',point(i),{kind:'origin'})
 const rectCons=(w,h,prefix,expr,refs)=>[C('h',edge(0,0)),C('v',edge(0,1)),C('h',edge(0,2)),C('v',edge(0,3)),anchored(0),D('len',edge(0,0),w,`${prefix}W`,expr,refs),D('len',edge(0,1),h,`${prefix}H`)]
 const wheelShapes=[1,.7,.3].map(f=>({type:'circle',c:[0,0],r:WheelDiameter*f/2}))
 const wheelCons=[anchored(0),C('concentric',circle(0),circle(1)),C('concentric',circle(0),circle(2)),...[1,.7,.3].map((f,i)=>D('dia',circle(i),WheelDiameter*f,['OuterDiameter','RimOpening','HubDiameter'][i],`WheelDiameter*${f}`,{WheelDiameter:'rig-wd'}))]
 const spokeW=WheelDiameter*.44,spokeH=4
 const sources={
 sk1:{name:'Concentric rim + hub',shapes:wheelShapes,cons:wheelCons,plane:'XY',baseZ:CarWidth/2-8,op:'new',height:8},
 sk2:{name:'Driving spoke',shapes:[{type:'rect',a:[0,0],b:[spokeW,spokeH]}],cons:rectCons(spokeW,spokeH,'Spoke','WheelDiameter*.44',{WheelDiameter:'rig-wd'}),plane:'XY',baseZ:CarWidth/2-8,op:'new',height:8},
 sk3:{name:'Wheelbase body coupon',shapes:[{type:'rect',a:[0,0],b:[Wheelbase,20]}],cons:rectCons(Wheelbase,20,'Body','Wheelbase',{Wheelbase:'rig-wb'}),plane:'XY',baseZ:-(CarWidth/2-10),op:'new',height:CarWidth-20},
 sk4:{name:'Wheel arch clearance',shapes:[{type:'circle',c:[0,0],r:WheelDiameter/2+2},{type:'circle',c:[Wheelbase,0],r:WheelDiameter/2+2}],cons:[anchored(0),C('h',point(0),point(1)),C('equal',circle(0),circle(1)),{...D('hdist',point(0),Wheelbase,'ArchStations','Wheelbase',{Wheelbase:'rig-wb'}),b:point(1)},D('dia',circle(0),WheelDiameter+4,'ArchDiameter','WheelDiameter+4',{WheelDiameter:'rig-wd'})],plane:'XY',baseZ:-(CarWidth/2-10),op:'cut',height:CarWidth-20}
 }
 const ext=(id,profile,operation,sketchId,baseZ,height)=>({id,type:'extrude',profile,operation,sketchId,baseZ,height})
 const features=[
 ...wheelShapes.map((s,i)=>ext(`F${i+1}`,{kind:'circle',c:[0,0],r:s.r},i===1?'cut':'new','sk1',CarWidth/2-8,8)),
 ext('F4',{kind:'rect',a:[0,0],b:[spokeW,-spokeH]},'new','sk2',CarWidth/2-8,8),
 {id:'F5',type:'circPattern',targets:['F4'],origin:[0,0,0],dir:[0,0,1],count:6,totalAngle:360,mode:'full'},
 {id:'F6',type:'mirror',plane:'XY',offset:0},
 {id:'F7',type:'pattern',countX:2,countY:1,dx:Wheelbase,dy:0},
 ext('F8',{kind:'rect',a:[0,0],b:[Wheelbase,-20]},'new','sk3',-(CarWidth/2-10),CarWidth-20),
 ext('F9',{kind:'circle',c:[0,0],r:WheelDiameter/2+2},'cut','sk4',-(CarWidth/2-10),CarWidth-20),
 ext('F10',{kind:'circle',c:[Wheelbase,0],r:WheelDiameter/2+2},'cut','sk4',-(CarWidth/2-10),CarWidth-20)
 ]
 const paramBindings={'F1:baseZ':'WheelStart','F2:baseZ':'WheelStart','F3:baseZ':'WheelStart','F4:baseZ':'WheelStart','F7:dx':'Wheelbase','F8:baseZ':'BodyStart','F8:height':'BodyDepth','F9:baseZ':'BodyStart','F9:height':'BodyDepth','F10:baseZ':'BodyStart','F10:height':'BodyDepth'}
 return {app:'webcad',version:4,projectName:'Native-Wheel-Rig',features,sketchSources:sources,params,paramBindings,components:[],componentDefs:[],suppressedIds:[],unit:'mm',bodyColor:'#4a7296',cameraProj:'ortho',edgeDisplay:'on',visualStyle:'shadedVisible'}
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]) {
 const {writeFile}=await import('node:fs/promises');await writeFile(process.argv[2]||'Native-Wheel-Rig.json',JSON.stringify(wheelRig(),null,2)+'\n')
}
