import {resolve as workerResolve} from './wheel-worker-loader.mjs'
export async function resolve(spec,ctx,next) {
 if(spec.startsWith('@salusoft89/')&&spec.endsWith('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true}
 if(spec==='comlink')return {url:'data:text/javascript,'+encodeURIComponent('export const expose=api=>globalThis.__wheelWorker=api; export const transfer=x=>x; export const wrap=x=>x; export const proxy=x=>x;'),shortCircuit:true}
 if(spec.endsWith('/cadService')||spec.endsWith('/cadService.ts'))return {url:'data:text/javascript,'+encodeURIComponent('export const cad=new Proxy({}, {get:(_,key)=>(...args)=>globalThis.__wheelWorker[key]?.(...args)}); export const onKernelRestart=()=>{}'),shortCircuit:true}
 return workerResolve(spec,ctx,next)
}
export async function load(url,ctx,next){const r=await next(url,ctx);return url.endsWith('/src/store.ts')?{...r,source:String(r.source).replaceAll('import.meta.env.DEV','false')}:r}
