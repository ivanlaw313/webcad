import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('./tests/',import.meta.url));register('./tests/native-car-loader.mjs',import.meta.url)
await import('./src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready();const{useApp}=await import('./src/store.ts'),{ellipseSample}=await import('./src/sketch/ellipseGeometry.ts');
const rows=[];
for(const route of ['gizmo','numeric'])for(const kind of ['ellipse','rectangle','fixed-circle']){
const e={cx:5,cy:7,rx:10,ry:5,rot:30},shape=kind==='fixed-circle'?{type:'circle',c:[5,7],r:10}:kind==='ellipse'?{type:'poly',ell:e,pts:ellipseSample(e),construction:true}:{type:'rect',a:[0,0],b:[10,5],construction:true};
useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'move',sketchProfiles:[shape],skCons:kind==='fixed-circle'?[{id:'fixed',kind:'con',type:'fix',a:{kind:'circle',shape:0}}]:[],skMove:{cx:5,cy:7,dx:20,dy:10,ang:0,copy:false,targets:[0],drag:null},appPrompt:async()=> '20,10,0,0'},true);
await useApp.getState()[route==='gizmo'?'commitSkMove':'skMovePrompt']();const after=useApp.getState().sketchProfiles[0];rows.push({route,kind,before:shape,after,undo:useApp.getState().sketchUndo.length,status:useApp.getState().status});
}
console.log(JSON.stringify(rows,null,2));
