import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {writeFile} from 'node:fs/promises'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const g=()=>useApp.getState()
useApp.setState({...useApp.getInitialState(),projectName:'關聯陣列－可見操作驗證',mode:'sketch',sketchPlane:'XY',sketchProfiles:[{type:'circle',c:[0,0],r:15}],skCons:[],sketchTool:'select'},true)
await g().createSketchPattern({kind:'rectangular',nx:3,ny:1,dx:50,dy:0})
await writeFile('../../outputs/關聯陣列-可見操作驗證.json',JSON.stringify(buildProjectPayload(g()),null,2))
