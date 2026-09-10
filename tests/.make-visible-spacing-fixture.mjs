import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {writeFile} from 'node:fs/promises'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const g=()=>useApp.getState()
useApp.setState({...useApp.getInitialState(),projectName:'Parallel spacing visible check',mode:'sketch',sketchPlane:'XY',sketchProfiles:[{type:'poly',pts:[[0,0],[20,0],[20,10],[0,10]]}],skCons:[{id:'base',kind:'con',type:'fix',a:{kind:'edge',shape:0,idx:0}},{id:'right',kind:'con',type:'v',a:{kind:'edge',shape:0,idx:1}},{id:'left',kind:'con',type:'v',a:{kind:'edge',shape:0,idx:3}}],sketchTool:'select'},true)
await g().createSketchPattern({kind:'rectangular',nx:2,ny:1,dx:40,dy:0})
await writeFile('../../outputs/visible-spacing.json',JSON.stringify(buildProjectPayload(g()),null,2))
