import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import vm from 'node:vm'
function harness(){
 const source=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8');
 const builder=source.slice(source.indexOf('function buildShellFeature('),source.indexOf('let _roundPvTimer'));
 const actions=source.slice(source.indexOf('  shellPreviewMesh: null,'),source.indexOf('  // R1 面圆角 face-fillet',source.indexOf('  shellPreviewMesh: null,')));
 const start=source.lastIndexOf('useApp.subscribe((s, prev) => {',source.indexOf("const fields: (keyof AppState)[] = ['shellMode'"));
 const subscription=source.slice(start,source.indexOf('\n})',start)+3);
 let state,listener;const pending=[],timers=new Map();let tid=0;
 const set=p=>{const prev=state;state={...state,...(typeof p==='function'?p(state):p)};listener?.(state,prev)};
 const context=vm.createContext({get:()=>state,set,_previewFeatures:new WeakMap(),hasSolid:()=>true,fid:()=> 'committed-shell',applyParamBindings:f=>f,expandFeats:f=>f,isNonPositiveDim:v=>!(Number(v)>0),illegalRejectStatus:m=>m,ILLEGAL_THICKNESS_DETAIL:"thickness",
 cad:{previewRound:features=>new Promise((resolve,reject)=>pending.push({features,resolve,reject}))},cancelPreviews:()=>{},isPreviewCancelled:()=>false,
 setTimeout:f=>{timers.set(++tid,f);return tid},clearTimeout:i=>timers.delete(i),useApp:{subscribe:f=>listener=f}});
 const api=vm.runInContext(stripTypeScriptTypes(`${builder};\n({${actions}})`),context);
 state={...api,mode:'model',shellMode:true,shellPicks:[[10,20,-10]],shellThickness:2,features:[{id:'body',type:'prim'}],params:[],paramBindings:[],suppressedIds:[],bodyMesh:{tag:'original'},undo:['original']};
 vm.runInContext(stripTypeScriptTypes(subscription),context);
 return {api,pending,timers,set,state:()=>state};
}
const mesh=tag=>({triangles:[0,1,2],tag});
test('typing invalidates old preview before debounce and preserves model/history',async()=>{
 const h=harness(),old=h.api.runShellPreview();h.api.setShellThickness(4);h.pending[0].resolve(mesh('old'));await old;
 assert.equal(h.state().shellPreviewMesh,null);assert.equal(h.state().shellPreviewBusy,true);
 const fresh=h.api.runShellPreview();assert.equal(h.pending[1].features.at(-1).thickness,4);h.pending[1].resolve(mesh('fresh'));await fresh;
 assert.equal(h.state().shellPreviewMesh.tag,'fresh');assert.equal(h.state().bodyMesh.tag,'original');assert.deepEqual(h.state().undo,['original']);
});
test('cancel, reopen and external model change discard stale responses',async()=>{
 const h=harness(),old=h.api.runShellPreview();h.api.cancelShell();h.api.toggleShell();h.pending[0].resolve(mesh('old'));await old;assert.equal(h.state().shellPreviewMesh,null);
 h.set({shellPicks:[[10,20,-10]],shellThickness:2});const next=h.api.runShellPreview();h.set({features:[{id:'replacement',type:'prim'}]});h.pending[1].resolve(mesh('old-model'));await next;assert.equal(h.state().shellPreviewMesh,null);
});
test('failure clears preview, invalid input cancels work, and next request recovers',async()=>{
 const h=harness(),bad=h.api.runShellPreview();h.pending[0].resolve({...mesh('bad'),failed:[{id:'~pv-shell'}]});await bad;
 assert.equal(h.state().shellPreviewFail,true);assert.equal(h.state().shellPreviewMesh,null);
 h.api.setShellThickness(0);assert.equal(h.timers.size,0);assert.equal(h.state().shellPreviewBusy,false);
 h.api.setShellThickness(2);const good=h.api.runShellPreview();h.pending[1].resolve(mesh('good'));await good;assert.equal(h.state().shellPreviewFail,false);assert.equal(h.state().shellPreviewMesh.tag,'good');
});
test('direction and closed-body options reach actual shared feature builder',async()=>{
 const h=harness();h.api.setShellDir('outside');h.api.setShellType('closed');h.api.shellPickAt([10,20,-10]);
 const p=h.api.runShellPreview(),f=h.pending[0].features.at(-1);assert.equal(f.direction,'outside');assert.equal(f.closed,true);assert.equal(f.nears,undefined);h.pending[0].resolve(mesh('closed'));await p;
});
