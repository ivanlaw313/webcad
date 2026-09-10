import {register} from 'node:module';import test from 'node:test';import assert from 'node:assert/strict'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {solveFree}=await import('../src/sketch/freesolve.ts')
const shapes=[{type:'poly',pts:[[0,0],[12,0],[12,10],[0,10]]}],pins=shapes[0].pts.map((_,idx)=>({id:`pin${idx}`,kind:'con',type:'fix',a:{kind:'pt',shape:0,idx}})),edge=idx=>({kind:'edge',shape:0,idx})
for(const [label,con,conflict] of [
 ['compatible length',{id:'dim',kind:'dim',type:'len',a:edge(0),value:12},false],
 ['incompatible length',{id:'dim',kind:'dim',type:'len',a:edge(0),value:10},true],
 ['compatible horizontal',{id:'h',kind:'con',type:'h',a:edge(0)},false],
 ['incompatible vertical',{id:'v',kind:'con',type:'v',a:edge(0)},true],
 ['compatible perpendicular',{id:'p',kind:'con',type:'perp',a:edge(0),b:edge(1)},false],
 ['incompatible equal',{id:'equal',kind:'con',type:'equal',a:edge(0),b:edge(1)},true],
 ])test(`fully fixed geometry validates ${label}`,async()=>{const original=JSON.stringify(shapes);const result=await solveFree(shapes,[...pins,con]);assert.ok(result);assert.equal(result.conflict,conflict);assert.equal(JSON.stringify(shapes),original);if(!conflict)assert.deepEqual(result.shapes,shapes)})

test('an unrelated free component does not hide a fixed component contradiction',async()=>{const result=await solveFree([...shapes,{type:'circle',c:[30,20],r:0,point:true}],[...pins,{id:'dim',kind:'dim',type:'len',a:edge(0),value:10}]);assert.ok(result);assert.equal(result.conflict,true)})

test('DOF diagnostic does not report contradictory fully fixed sketch as fully constrained',async()=>{const {diagnoseSketchDof}=await import('../src/sketch/solver.ts');const primitives=[{id:'a',type:'point',x:0,y:0,fixed:true},{id:'b',type:'point',x:12,y:0,fixed:true},{id:'l',type:'line',p1_id:'a',p2_id:'b'},{id:'d',type:'p2p_distance',p1_id:'a',p2_id:'b',distance:10}];const result=await diagnoseSketchDof(primitives);assert.equal(result.ok,false)})
