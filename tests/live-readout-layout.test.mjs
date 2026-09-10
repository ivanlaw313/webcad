import test from 'node:test'
import assert from 'node:assert/strict'
import {placeLiveReadout} from '../src/components/liveReadoutLayout.ts'
for(const [name,width,height,obstacles]of[
 ['normal toolbar',1054,644,[{x:12,y:12,width:1026,height:48}]],
 ['moved toolbar',1054,644,[{x:250,y:90,width:700,height:48}]],
 ['collapsed toolbar',390,420,[{x:12,y:12,width:140,height:34}]],
 ['short with panel',570,250,[{x:12,y:12,width:546,height:48},{x:15,y:70,width:234,height:140},{x:140,y:210,width:400,height:32}]],
])test(name,()=>{const r=placeLiveReadout(width,height,{width:190,height:30},obstacles);assert.equal(r.conflict,false);assert.ok(r.x>=8&&r.y>=8&&r.x+r.width<=width-8&&r.y+r.height<=height-8)})
