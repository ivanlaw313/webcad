import test from 'node:test'
import assert from 'node:assert/strict'
import { placeDimensionLabel, labelsOverlap } from '../src/components/dimensionLabelLayout.ts'

test('dense car dimensions stay inside a narrow canvas without overlap', () => {
  const placed = []
  for (let i = 0; i < 18; i++) {
    const label = placeDimensionLabel({ x: 220, y: 240, w: 72, h: 17 }, placed, 242, 260)
    assert.ok(label.x - label.w / 2 >= 4 && label.x + label.w / 2 <= 238)
    assert.ok(label.y - label.h / 2 >= 4 && label.y + label.h / 2 <= 256)
    assert.ok(placed.every(other => !labelsOverlap(label, other)))
    placed.push(label)
  }
})

test('a formula editor is measured at its real width and stays reachable', () => {
  const label = placeDimensionLabel({ x: -40, y: 500, w: 220, h: 24 }, [], 242, 260)
  assert.equal(label.x, 114)
  assert.equal(label.y, 244)
})

test('an unobstructed user label position is retained', () => {
  const wanted = { x: 123, y: 87, w: 58, h: 17 }
  assert.deepEqual(placeDimensionLabel(wanted, [], 800, 600), wanted)
})

test('geometry point obstruction moves a label even when no prior label exists',()=>{const point={x:100,y:100,w:14,h:14},wanted={x:100,y:100,w:70,h:20},label=placeDimensionLabel(wanted,[],400,300,[point]);assert.equal(labelsOverlap(label,point),false);assert.notDeepEqual(label,wanted)})
test('multiple horizontal and vertical geometry anchors remain uncovered together with other labels',()=>{const obstacles=[{x:100,y:100,w:180,h:12},{x:100,y:155,w:12,h:160}],placed=[{x:250,y:60,w:90,h:24}];for(let i=0;i<6;i++){const result=placeDimensionLabel({x:100,y:100,w:70,h:20},placed,400,300,obstacles);assert.ok([...placed,...obstacles].every(box=>!labelsOverlap(result,box)));placed.push(result)}})
test('clear manually positioned label stays put; blocked manual position finds a reachable fallback',()=>{const wanted={x:260,y:80,w:80,h:24},obstacles=[{x:40,y:40,w:16,h:16}];assert.deepEqual(placeDimensionLabel(wanted,[],400,300,obstacles),wanted);obstacles.push({x:260,y:80,w:20,h:20});const moved=placeDimensionLabel(wanted,[],400,300,obstacles);assert.ok(obstacles.every(box=>!labelsOverlap(moved,box)));assert.ok(moved.x-moved.w/2>=4&&moved.x+moved.w/2<=396)})
test('fully obstructed screen retains finite clamped fallback without mutating inputs',()=>{const wanted={x:-20,y:500,w:80,h:20},obstacles=[{x:50,y:40,w:1000,h:1000}],before=JSON.stringify([wanted,obstacles]),result=placeDimensionLabel(wanted,[],100,80,obstacles);assert.deepEqual(result,{x:44,y:66,w:80,h:20});assert.equal(JSON.stringify([wanted,obstacles]),before)})
test('invalid dimensions and zero-sized viewport still produce finite visible boxes',()=>{const result=placeDimensionLabel({x:NaN,y:Infinity,w:Infinity,h:-4},[],0,0,[{x:NaN,y:0,w:1,h:1}]);assert.ok(Object.values(result).every(Number.isFinite));assert.ok(result.w>0&&result.h>0);assert.ok(result.x-result.w/2>=0&&result.y-result.h/2>=0)})
