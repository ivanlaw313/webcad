import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {writeFile} from 'node:fs/promises'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const g=()=>useApp.getState()
useApp.setState({...useApp.getInitialState(),projectName:'相切與角度－可見操作驗證',mode:'sketch',sketchPlane:'XY',sketchProfiles:[{type:'circle',c:[0,0],r:5},{type:'poly',pts:[[-10,8],[10,8]],open:true,construction:true}],skCons:[{id:'radius',name:'R1',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5},{id:'lineFix',kind:'con',type:'fix',a:{kind:'edge',shape:1,idx:0}}],sketchTool:'select'},true)
await g().createSketchPattern({kind:'rectangular',nx:2,ny:1,dx:40,dy:0})
await writeFile('../../outputs/相切-可見操作驗證.json',JSON.stringify(buildProjectPayload(g()),null,2))
