import test from 'node:test'
import assert from 'node:assert/strict'
import { protectEscape, registerEscapeLayer } from '../src/cad/escapeKey.ts'
globalThis.window = new EventTarget()
function esc(extra={}) { const e=new Event('keydown',{cancelable:true});Object.assign(e,{key:'Escape',repeat:false,isComposing:false,...extra});return e }
test('Esc prevents browser default while leaving one local editor handler available; repeats are consumed',()=>{
 let hits=0;window.addEventListener('keydown',protectEscape);const local=()=>hits++;window.addEventListener('keydown',local)
 const e=esc();window.dispatchEvent(e);assert.ok(e.defaultPrevented);assert.equal(hits,1)
 window.dispatchEvent(esc({repeat:true}));assert.equal(hits,1)
 const ime=esc({isComposing:true});window.dispatchEvent(ime);assert.equal(ime.defaultPrevented,false);assert.equal(hits,2)
 window.removeEventListener('keydown',protectEscape);window.removeEventListener('keydown',local)
})
test('one Esc dismisses only the top overlay, regardless of listener order; cleanup restores lower layers',()=>{
 const calls=[];const low=registerEscapeLayer(()=>calls.push('menu'),120);const high=registerEscapeLayer(()=>calls.push('prompt'),30000)
 window.dispatchEvent(esc());assert.deepEqual(calls,['prompt']);window.dispatchEvent(esc({repeat:true}));assert.equal(calls.length,1)
 high();window.dispatchEvent(esc());assert.deepEqual(calls,['prompt','menu']);low()
 const e=esc();window.dispatchEvent(e);assert.equal(e.defaultPrevented,false)
})
test('the latest peer overlay wins, composition never dismisses layers',()=>{
 let a=0,b=0;const offA=registerEscapeLayer(()=>a++,100),offB=registerEscapeLayer(()=>b++,100)
 window.dispatchEvent(esc({isComposing:true}));window.dispatchEvent(esc({keyCode:229}));assert.equal(a+b,0)
 window.dispatchEvent(esc());assert.equal(b,1);offB();window.dispatchEvent(esc());assert.equal(a,1);offA()
})
