import test from 'node:test'
import assert from 'node:assert/strict'
import {sketchConstraintColor} from '../src/components/sketchConstraintColor.ts'
test('positive DOF with unknown per-entity mobility stays blue',()=>{
 for(const dof of [2,8,1,100])assert.equal(sketchConstraintColor(false,dof,false,3),'#1572c4')
})
test('only a nonconflicting constrained zero-DOF sketch establishes black',()=>{
 assert.equal(sketchConstraintColor(false,0,false,3),'#16191d')
 for(const [dof,conflict,count] of [[null,false,3],[0,true,3],[0,false,0]])assert.equal(sketchConstraintColor(false,dof,conflict,count),'#1572c4')
})
test('explicit Fix keeps its distinct green cue',()=>{
 for(const dof of [null,0,2,8])assert.equal(sketchConstraintColor(true,dof,false,3),'#2f9e44')
})
