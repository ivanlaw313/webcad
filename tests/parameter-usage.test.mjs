import test from 'node:test'
import assert from 'node:assert/strict'
import {parameterUsage} from '../src/cad/parameterUsage.ts'
test('usage follows stable parameter IDs through indirect parameters, dimensions and features',()=>{
 const ps=[{id:'p1',name:'CarWidth',value:90},{id:'p2',name:'HalfWidth',value:45,refs:{CarWidth:'p1'}},{id:'replacement',name:'OldWidth',value:2}]
 const cons=[{id:'c1',kind:'dim',name:'d1',refs:{HalfWidth:'p2'}},{id:'c2',kind:'dim',name:'d2',refs:{d1:'dimension:c1'}}]
 const uses=parameterUsage(ps,{sk1:{cons}},{},[{id:'F1',type:'extrude',distanceExpression:{refs:{HalfWidth:'p2'}}}],cons)
 assert.equal(uses(ps[0]).length,4);assert.equal(uses(ps[1]).length,3);assert.equal(uses(ps[2]).length,0)
})
