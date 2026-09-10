import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const {importSTEP,measureVolume}=await import('replicad')
const loop={type:'poly',pts:[[0,0],[10,0],[10,6],[0,6]],projected:true,projectLink:'all',projectLinkIssue:'constraints',construction:true}
const circle={type:'circle',c:[10,0],r:1}
const cons=[{id:'k1',kind:'con',type:'coincident',a:{kind:'pt',shape:1,idx:0},b:{kind:'pt',shape:0,idx:1}},{id:'k2',kind:'dim',type:'rad',a:{kind:'circle',shape:1},value:1,name:'d1'}]
const ref=(width=12)=>({pts:[[0,0],[width,0],[width,6],[0,6]],segs:[[[0,0],[width,0]],[[width,0],[width,6]],[[width,6],[0,6]],[[0,6],[0,0]]]})
function setup(extra={}){useApp.setState({...useApp.getInitialState()},true);useApp.setState({mode:'sketch',sketchProfiles:[structuredClone(loop)],sketchShape:structuredClone(circle),skCons:structuredClone(cons),skRefGeo:ref(),...extra})}
const geom=()=>JSON.stringify([useApp.getState().sketchProfiles,useApp.getState().sketchShape,useApp.getState().skCons,useApp.getState().sketchUndo,useApp.getState().sketchRedo])
async function preview(){useApp.getState().beginProjectRelink(0);assert.equal(useApp.getState().projectRelink.candidates.length,1);await useApp.getState().selectProjectRelinkCandidate(0);assert.ok(useApp.getState().projectRelink.preview,useApp.getState().projectRelink.error)}

for(const throughEdit of [false,true]){
 const features=[{id:'plate',type:'extrude',profile:{kind:'rect',a:[0,0],b:[12,10]},height:10,operation:'new'},{id:'guide',type:'sketch',sketchId:'s1'}];const curve={type:'poly',pts:[[0,0],[10,0],[10,-10],[0,-10]],construction:true,projected:true,projectLink:'all'};const cs=[{id:'width',name:'dWidth',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:10}];
 useApp.setState({...useApp.getInitialState(),features,timelinePos:2,sketchSources:{s1:{shapes:[curve],cons:cs,plane:'XY',baseZ:10,height:0,op:'new'}}},true);await useApp.getState().applyFeatures(features,'fixture',false);await useApp.getState().editSketchOf('guide');if(!throughEdit)useApp.setState({skCons:cs});
 useApp.getState().beginProjectRelink(0);await useApp.getState().selectProjectRelinkCandidate(0);console.log(JSON.stringify({throughEdit,cons:useApp.getState().skCons,repair:useApp.getState().projectRelink},null,2));
}
