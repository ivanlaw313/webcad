import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url);
const {useApp,buildProjectPayload}=await import('../src/store.ts');const {commandDisabledReason}=await import('../src/cad/commandAvailability.ts');
const clone=v=>JSON.parse(JSON.stringify(v));
async function box(){useApp.setState({...useApp.getInitialState()},true);await useApp.getState().startFormBox(40,30,20,2,2,2);return useApp.getState().formCage}
test('all single-point updates in one drag have one complete undo/redo; Esc rolls back',async()=>{
 const before=clone(await box());useApp.getState().beginFormEdit();useApp.getState().setFormVert(0,[-22,-15,0]);useApp.getState().setFormVert(0,[-24,-15,0]);useApp.getState().endFormEdit();const after=clone(useApp.getState().formCage);assert.equal(useApp.getState().formUndo.length,1);
 await useApp.getState().undo();assert.deepEqual(useApp.getState().formCage,before);await useApp.getState().redo();assert.deepEqual(useApp.getState().formCage,after);
 useApp.getState().beginFormEdit();useApp.getState().setFormVert(0,[2,3,4]);useApp.getState().cancelFormEdit();assert.deepEqual(useApp.getState().formCage,after);
});
for(const op of ['crease','softness','extrude','loop','mirror','levels','group'])test(`${op} restores topology, creases and geometry with undo/redo`,async()=>{
 await box();useApp.getState().selFormFace(0);if(op!=='crease')useApp.getState().formCrease();const before=clone(useApp.getState().formCage);
 if(op==='crease')useApp.getState().formCrease();if(op==='softness')useApp.getState().setFormCreaseSoft(.5);if(op==='extrude')await useApp.getState().formExtrudeFace(5);if(op==='loop')await useApp.getState().formInsertLoop(0);if(op==='mirror')await useApp.getState().formMirror(0);if(op==='levels')useApp.getState().setFormLevels(3);if(op==='group'){useApp.setState({formCage:{...useApp.getState().formCage,msel:[0,1]}});useApp.getState().transformFormVerts([1,0,0,0,0,1,0,0,0,0,1,0,3,0,0,1])}
 const after=clone(useApp.getState().formCage);assert.notDeepEqual(after.verts.concat([after.levels,after.creases,after.creaseSoft]),before.verts.concat([before.levels,before.creases,before.creaseSoft]));
 await useApp.getState().undo();const restored=useApp.getState().formCage;for(const k of ['verts','quads','creases','levels','creaseSoft'])assert.deepEqual(restored[k],before[k],k);await useApp.getState().redo();assert.deepEqual(useApp.getState().formCage,after);
});
test('Form history never falls through to the document history',async()=>{await box();useApp.setState({undoStack:[{fake:'document'}],redoStack:[{fake:'document'}]});await useApp.getState().undo();await useApp.getState().redo();assert.equal(useApp.getState().formMode,true);assert.equal(useApp.getState().undoStack.length,1);assert.equal(useApp.getState().redoStack.length,1)});
test('finish stores an editable cage; JSON roundtrip, reopen, cancel and update retain one component',async()=>{
 await box();await useApp.getState().finishForm();let c=useApp.getState().components[0];assert.ok(c.formSource);const saved=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));assert.deepEqual(saved.components[0].formSource,c.formSource);
 useApp.setState({...useApp.getInitialState(),components:saved.components,componentDefs:saved.componentDefs},true);useApp.getState().editFormComponent(c.id);assert.equal(useApp.getState().formMode,true);useApp.getState().setFormVert(0,[-25,-15,0]);useApp.getState().cancelForm();assert.deepEqual(useApp.getState().components[0].formSource,c.formSource);assert.equal(useApp.getState().components[0].hidden,false);
 useApp.getState().editFormComponent(c.id);useApp.getState().setFormVert(0,[-25,-15,0]);await useApp.getState().finishForm();assert.equal(useApp.getState().components.length,1);assert.equal(useApp.getState().components[0].formSource.verts[0][0],-25);
});
test('cancelled async creation or finish cannot resurrect a Form',async()=>{
 useApp.setState({...useApp.getInitialState()},true);const pending=useApp.getState().startFormBox(40,30,20,2,2,2);useApp.getState().cancelForm();await pending;assert.equal(useApp.getState().formCage,null);assert.equal(useApp.getState().formMode,false);
 await box();const finish=useApp.getState().finishForm();useApp.getState().cancelForm();await finish;assert.equal(useApp.getState().components.length,0);
});
test('unsupported commands and a second creation are disabled without changing current cage',async()=>{await box();assert.ok(commandDisabledReason(useApp.getState(),'formloft'));assert.ok(commandDisabledReason(useApp.getState(),'formbox'));const before=useApp.getState().formCage;await useApp.getState().runCommand('formbox','Box');assert.equal(useApp.getState().formCage,before)});
for(const plane of ['XZ','YZ'])test(`non-box primitive respects ${plane} orientation`,async()=>{const c=clone(await box());useApp.getState().orientFormCage(plane);assert.deepEqual(useApp.getState().formCage.verts[0],plane==='XZ'?[c.verts[0][0],-c.verts[0][2],c.verts[0][1]]:[c.verts[0][2],c.verts[0][1],-c.verts[0][0]])});
test('face selection supports move/rotate/scale and clearing removes all selected points',async()=>{
 const c=clone(await box());useApp.getState().selFormFace(0);assert.deepEqual(useApp.getState().formCage.msel,c.quads[0]);
 useApp.getState().transformFormVerts([1,0,0,0,0,1,0,0,0,0,1,0,3,0,0,1]);
 for(let i=0;i<c.verts.length;i++)assert.equal(useApp.getState().formCage.verts[i][0],c.verts[i][0]+(c.quads[0].includes(i)?3:0));
 useApp.getState().selFormFace(null);assert.deepEqual(useApp.getState().formCage.msel,[]);
});
test('inserting a loop keeps the split crease edges and undo restores the originals',async()=>{
 await box();useApp.getState().selFormFace(0);useApp.getState().formCrease();const before=clone(useApp.getState().formCage);await useApp.getState().formInsertLoop(0);const after=useApp.getState().formCage;
 assert.ok(after.creases.length>before.creases.length);const edges=new Set(after.quads.flatMap(q=>q.map((a,k)=>[a,q[(k+1)%4]].sort((a,b)=>a-b).join('_'))));for(const e of after.creases)assert.ok(edges.has(e.join('_')));
 await useApp.getState().undo();assert.deepEqual(useApp.getState().formCage.creases,before.creases);
});
test('post-finish mesh edits cannot be overwritten by the old control cage',async()=>{
 await box();await useApp.getState().finishForm();let c=useApp.getState().components[0];useApp.setState({components:[{...c,mesh:{...c.mesh,vertices:c.mesh.vertices.map((v,i)=>i===0?v+1:v)}}]});useApp.getState().editFormComponent(c.id);assert.equal(useApp.getState().formMode,false);assert.match(useApp.getState().status,/旧控制笼/);
});
test('unfinished Form and re-edit draft survive actual project loader and cancellation',async()=>{
 await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready();
 await box();useApp.getState().setFormVert(0,[-24,-15,0]);let saved=clone(buildProjectPayload(useApp.getState()));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(saved);assert.equal(useApp.getState().formMode,true);assert.equal(useApp.getState().formCage.verts[0][0],-24);assert.equal(commandDisabledReason(useApp.getState(),'act:save'),null);
 await useApp.getState().finishForm();let c=useApp.getState().components[0];useApp.getState().editFormComponent(c.id);useApp.getState().setFormVert(0,[-26,-15,0]);saved=clone(buildProjectPayload(useApp.getState()));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(saved);assert.equal(useApp.getState().formEditId,c.id);assert.equal(useApp.getState().components[0].hidden,true);useApp.getState().cancelForm();assert.equal(useApp.getState().components[0].hidden,false);assert.equal(useApp.getState().components[0].formSource.verts[0][0],-24);
});
for(const [method,args] of [['startFormBox',[40,30,20,2,2,2]],['startFormCylinder',[20,30,4,2]],['startFormSphere',[20,2]],['startFormTorus',[30,10,8,6]],['startFormPlane',[40,30,2,2]],['startFormOpenPatch',[40,30,2,2]],['startFormPipe',[[[0,0,0],[20,0,0],[30,10,0]],8,6]]])test(`${method}: create, edit, finish and reopen keep valid geometry`,async()=>{
 useApp.setState({...useApp.getInitialState()},true);await useApp.getState()[method](...args);const cage=useApp.getState().formCage;assert.ok(cage?.verts.length);useApp.getState().setFormVert(0,cage.verts[0].map((v,i)=>i===0?v+.1:v));await useApp.getState().finishForm();const c=useApp.getState().components[0];assert.ok(c.mesh.vertices.every(Number.isFinite));assert.ok(c.mesh.triangles.length);useApp.getState().editFormComponent(c.id);assert.ok(useApp.getState().formMode);assert.deepEqual(useApp.getState().formCage.verts,c.formSource.verts);
});
