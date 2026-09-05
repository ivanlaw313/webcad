import {fileURLToPath} from 'node:url'
export async function resolve(spec,ctx,next){
 if(spec==='comlink')return {url:'data:text/javascript,'+encodeURIComponent('export const expose=api=>globalThis.__wheelWorker=api; export const transfer=x=>x;'),shortCircuit:true}
 if(spec.endsWith('?url')){const path=fileURLToPath(new URL(spec.slice(0,-4),ctx.parentURL));return {url:'data:text/javascript,'+encodeURIComponent('export default '+JSON.stringify(path)),shortCircuit:true}}
 return next(spec,ctx)
}
