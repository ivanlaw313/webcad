import { spawn, execFileSync } from 'node:child_process'
const identity = pid => { try { return execFileSync('ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], { encoding: 'utf8' }).trim() } catch { return '' } }
function killGroup(pid, signal) { try { process.kill(-pid, signal) } catch (e) { if (e.code !== 'ESRCH') throw e } }
export async function runWorkflowProcess({ command=process.execPath, args, cwd, env, logFd, timeoutMs, signal, graceMs=3000, processIdentity=identity }) {
  const owned = new Map(), cleanupErrors=[]
  const child=spawn(command,args,{cwd,env,detached:true,stdio:['ignore',logFd,logFd,'ipc']})
  let timedOut=false,killTimer,stopping=false
  const killOwned = sig => { for(const [pid,key] of owned) { if(processIdentity(pid)===key) try { killGroup(pid,sig) } catch(e) { cleanupErrors.push(e.message) } } }
  const stop=()=>{ if(stopping)return;stopping=true;if(child.pid)try{killGroup(child.pid,'SIGTERM')}catch(e){cleanupErrors.push(e.message)};killOwned('SIGTERM');killTimer=setTimeout(()=>{if(child.pid)try{killGroup(child.pid,'SIGKILL')}catch(e){cleanupErrors.push(e.message)};killOwned('SIGKILL')},graceMs) }
  child.on('message',message=>{if(message?.type==='webcad-browser-owned'&&Number.isSafeInteger(message.pid)&&message.pid>1){const key=processIdentity(message.pid);if(key)owned.set(message.pid,key);else cleanupErrors.push(`Cannot verify registered browser process ${message.pid}; automatic cleanup is unavailable`);if(stopping)killOwned('SIGTERM')}})
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop()
  const timer=setTimeout(()=>{timedOut=true;stop()},timeoutMs)
  let outcome
  try { outcome=await new Promise(resolve=>{child.once('error',e=>resolve({error:e.message}));child.once('close',(code,signal)=>resolve({code,signal}))}) }
  finally {
    clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',stop)
    // A killed Node owner cannot run Playwright's cleanup; kill its registered browser groups.
    killOwned('SIGKILL')
  }
  return {...outcome,timedOut,cleanupErrors}
}
