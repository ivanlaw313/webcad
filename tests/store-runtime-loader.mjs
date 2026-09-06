export async function resolve(spec,ctx,next) {
 if(spec.endsWith('/cadService')||spec.endsWith('/cadService.ts')) return {url:'data:text/javascript,'+encodeURIComponent('export const cad=new Proxy({}, {get:(_,key)=>async(...args)=> key==="ready"?true:key==="rebuild"&&args[0].every(f=>f.type==="sketch")?{vertices:[],triangles:[],normals:[]}:null}); export const onKernelRestart=()=>{}'),shortCircuit:true}
 if(spec.endsWith('?url')) return {url:'data:text/javascript,export default %22%22',shortCircuit:true}
 return next(spec,ctx)
}
export async function load(url,ctx,next){
 const result=await next(url,ctx)
 if(url.endsWith('/src/store.ts'))return {...result,source:String(result.source).replaceAll('import.meta.env.DEV','false')}
 return result
}
