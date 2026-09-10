import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {writeFile} from 'node:fs/promises'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const g=()=>useApp.getState()
useApp.setState({...useApp.getInitialState(),projectName:'Associative circle offset visible check',mode:'sketch',sketchPlane:'XY',sketchProfiles:[{type:'circle',c:[0,0],r:10}],skCons:[{id:'radius',name:'Radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10}],sketchTool:'select'},true)
await g().createSketchPattern({kind:'rectangular',nx:2,ny:1,dx:40,dy:0})
await writeFile('../../outputs/visible-circle-offset.json',JSON.stringify(buildProjectPayload(g()),null,2))
