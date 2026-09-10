import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn, execFileSync } from 'node:child_process'
import { runWorkflowProcess } from '../examples/workflow-process.mjs'
const alive=pid=>{try{process.kill(pid,0);return true}catch{return false}}
async function fixture(fn){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'webcad-runner-'));const log=await fs.open(path.join(dir,'log'),'w');try{await fn({dir,logFd:log.fd})}finally{await log.close();await fs.rm(dir,{recursive:true,force:true})}}
test('one failed process does not prevent independent successful lane',async()=>fixture(async f=>{
 const results=await Promise.all([1,0,0].map(code=>runWorkflowProcess({...f,args:['-e',`process.exit(${code})`],timeoutMs:2000})))
 assert.deepEqual(results.map(r=>r.code),[1,0,0])
}))
test('hard timeout kills registered detached browser analogue, not unrelated processes',async t=>{
 // Match production identity requirements before creating a detached process.
 // A skipped integration check must remain visible when the sandbox denies ps.
 try {
  const key=execFileSync('ps',['-p',String(process.pid),'-o','lstart=','-o','command='],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()
  if(!key){t.skip('Process identity inspection returned no identity; detached-process cleanup remains unverified');return}
 }catch{t.skip('Process identity inspection (ps) unavailable; detached-process cleanup remains unverified');return}
 return fixture(async f=>{
 const unrelated=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});try {
 const script=`const {spawn}=require('node:child_process');const fs=require('node:fs');const c=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setTimeout(()=>process.exit(0),5000);setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});fs.writeFileSync(${JSON.stringify(path.join(f.dir,'pid'))},String(c.pid));process.send({type:'webcad-browser-owned',pid:c.pid});process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
 const r=await runWorkflowProcess({...f,args:['-e',script],timeoutMs:500,graceMs:100});assert.equal(r.timedOut,true);assert.equal(r.signal,'SIGKILL')
 const pid=Number(await fs.readFile(path.join(f.dir,'pid'),'utf8'));await new Promise(r=>setTimeout(r,100));assert.equal(alive(pid),false);assert.deepEqual(r.cleanupErrors,[]);assert.equal(alive(unrelated.pid),true)
 } finally { unrelated.kill('SIGKILL') }
 })
})
test('abort uses bounded hard kill rather than waiting for workflow timeout',async()=>fixture(async f=>{
 const controller=new AbortController(),start=Date.now();setTimeout(()=>controller.abort(),300)
 const r=await runWorkflowProcess({...f,args:['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],timeoutMs:10000,graceMs:100,signal:controller.signal});assert.equal(r.timedOut,false);assert.ok(Date.now()-start<2000);assert.equal(r.signal,'SIGKILL')
}))
test('spawn failure resolves as failure instead of rejecting the lane scheduler',async()=>fixture(async f=>{
 const r=await runWorkflowProcess({...f,command:'/nonexistent-webcad-test-command',args:[],timeoutMs:1000});assert.match(r.error,/ENOENT/)
}))

test('unavailable process identity is reported without pretending cleanup succeeded',async()=>fixture(async f=>{
 const r=await runWorkflowProcess({...f,args:['-e','process.send({type:"webcad-browser-owned",pid:123456789});setTimeout(()=>process.exit(0),20)'],timeoutMs:2000,processIdentity:()=>''});
 assert.equal(r.code,0);assert.equal(r.cleanupErrors.length,1);assert.match(r.cleanupErrors[0],/Cannot verify registered browser process/);
}));
