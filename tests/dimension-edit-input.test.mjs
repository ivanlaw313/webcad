import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {parseDimensionEditInput} from '../src/sketch/dimensionEditInput.ts'
const source=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
const evaluate=vm.runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('const D2R ='),source.indexOf('// DEV-only hook')).replace('export function evalExpr','function evalExpr')+';evalExpr'))
const con={kind:'dim',id:'d',name:'d1',type:'len',value:5,a:{kind:'edge',shape:0,idx:0}}
const parse=(raw,extra={})=>parseDimensionEditInput({con,raw,unit:'mm',params:[],cons:[con],evaluate,...extra})
test('numeric lengths, fractions, unit arithmetic and angles parse exactly',()=>{
 for(const [text,unit,value]of [['1 1/2','inch',38.1],['2+3','cm',50],['2 cm+5 mm','inch',25],['1/2','inch',12.7]])assert.ok(Math.abs(parse(text,{unit}).patch.value-value)<1e-10,text)
 assert.equal(parse('30°',{con:{...con,type:'angle'}}).patch.value,30)
})
test('radius/diameter display conversion applies to numeric input',()=>{
 assert.equal(parse('10',{radDia:{type:'rad',flip:true}}).patch.value,5)
 assert.equal(parse('10',{radDia:{type:'dia',flip:true}}).patch.value,20)
})
test('radius/diameter display conversion applies to parameter and formula input',()=>{
 const params=[{id:'width',name:'W',value:10}]
 assert.equal(parse('W',{radDia:{type:'dia',flip:true},params}).patch.value,20)
 assert.equal(parse('W*2',{radDia:{type:'dia',flip:true},params}).patch.value,40)
 assert.equal(parse('W',{radDia:{type:'rad',flip:true},params}).patch.value,5)
})
test('invalid drafts rejected; only horizontal/vertical distance accepts zero',()=>{
 for(const raw of ['', '-', '1e', '12garbage','1/0','0','-2'])assert.equal(parse(raw).ok,false,raw)
 for(const type of ['hdist','vdist'])assert.equal(parse('0',{con:{...con,type}}).patch.value,0)
})
test('parameter and formula bindings keep stable IDs without mutating input',()=>{
 const params=[{id:'width',name:'W',value:8}],before=JSON.stringify({con,params})
 assert.equal(parse('=W',{params}).patch.paramId,'width')
 const result=parse('W*2',{params});assert.equal(result.patch.value,16);assert.equal(result.patch.refs.W,'width')
 assert.equal(JSON.stringify({con,params}),before)
})
test('dimension self reference is rejected',()=>assert.equal(parse('d1*2').ok,false))
