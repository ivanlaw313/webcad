import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import vm from 'node:vm'
import {dimensionExpression} from '../src/cad/dimensionExpression.ts'
const store=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
const scalar=store.slice(store.indexOf('const D2R ='),store.indexOf('// DEV-only hook')).replace('export function evalExpr','function evalExpr')
const evalExpr=vm.runInNewContext(stripTypeScriptTypes(scalar+';evalExpr'))
const params=[{id:'pL',name:'L',unit:'mm',value:420},{id:'pW',name:'W',unit:'mm',expr:'L*176/420',value:176}]
test('uses existing evaluator for arithmetic, units, signs and parameter dimensions',()=>{
 for(const [input,expected] of [['W/2',88],['20 mm + 1 cm',30],['(10+5)*2',30],['4200 mm/10',420],['-W',-176],['-2^2',-4],['L*176/420',176]]) assert.equal(dimensionExpression(input,params,evalExpr).value,expected,input)
})
test('half input, unknown names, mismatched units, invalid syntax and division by zero cannot yield stale values',()=>{
 for(const input of ['W/','Missing/2','W/0','20 mm+1 deg','2 mm*3 mm','(10+5','10+5)','1;alert(2)','20 deg','W L']) {
  const r=dimensionExpression(input,params,evalExpr);assert.equal(r.value,undefined,input);assert.ok(r.error,input)
 }
})
test('stored ID references survive renamed parameter and native JSON round trip',()=>{
 const r=dimensionExpression('W/2',params,evalExpr)
 const saved=JSON.parse(JSON.stringify(r.formula));const renamed=[params[0],{...params[1],name:'Width',value:193.6}]
 assert.equal(dimensionExpression(saved.expression,renamed,evalExpr,saved.unit,saved.refs).value,96.8)
 assert.equal(dimensionExpression(saved.expression,[params[0]],evalExpr,saved.unit,saved.refs).value,undefined)
})
test('implicit display units remain attached to persisted expressions',()=>{
 const r=dimensionExpression('(10+5)*2',[],evalExpr,'mm',undefined,10)
 assert.equal(r.value,300)
 const d=JSON.parse(JSON.stringify(r.formula))
 assert.equal(dimensionExpression(d.expression,[],evalExpr,d.unit,d.refs,d.implicitScale).value,300)
})
test('feature binding converts symmetric half to full kernel length without losing formula',()=>{
 const fn=store.slice(store.indexOf('function applyParamBindings('),store.indexOf('// Safe arithmetic evaluator'))
 const bind=vm.runInNewContext(stripTypeScriptTypes(fn+';applyParamBindings'),{dimensionExpression,evalExpr})
 const formula=dimensionExpression('W/2',params,evalExpr).formula
 const f={id:'e',type:'extrude',height:176,symmetric:true,distanceExpression:{...formula,measure:'half'}}
 const changed=[params[0],{...params[1],value:193.6}]
 const half=bind([f],changed,{})[0],whole=bind([{...f,distanceExpression:{...formula,measure:'whole'}}],changed,{})[0]
 assert.equal(half.height,193.6);assert.equal(whole.height,96.8)
 assert.equal(half.distanceExpression.expression,'W/2');assert.equal(f.height,176)
 assert.equal(bind([{...f,distanceExpression:{...formula,measure:'half',flip:true}}],changed,{})[0].down,true)
 assert.equal(bind([f],[params[0],{...params[1],value:-176}],{})[0].down,true)
 assert.equal(bind([f],changed,{'e:height':'L'})[0].height,193.6)
})
