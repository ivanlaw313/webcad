import test from 'node:test'
import assert from 'node:assert/strict'
import {drawingScale,drawingLinearOffset,dxfTextValue} from '../src/io/drawingLayout.ts'
test('paper scale changes real length without changing measured dimension',()=>{assert.equal(40*drawingScale('1:2'),20);assert.equal(40*drawingScale('2:1'),80);assert.equal(drawingScale('0:1'),1)})
test('linear drag computes perpendicular displacement and leaves endpoints untouched',()=>{const d={x1:0,y1:0,x2:30,y2:40};assert.equal(drawingLinearOffset(d,{x:-8,y:6}),10);assert.deepEqual(d,{x1:0,y1:0,x2:30,y2:40})})
test('DXF text preserves Chinese and symbols without corrupting group-code lines',()=>{assert.equal(dxfTextValue('孔 Ø8 ±0.1\n材料'),'\\U+5B54 %%c8 %%p0.1 \\U+6750\\U+6599')})
