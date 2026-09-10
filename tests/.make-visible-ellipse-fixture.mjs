import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {writeFile} from 'node:fs/promises'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const g=()=>useApp.getState()
const {ellipseSample}=await import('../src/sketch/ellipseGeometry.ts');const ell={cx:0,cy:0,rx:10,ry:5,rot:25}
useApp.setState({...useApp.getInitialState(),projectName:'橢圓雙軸－可見操作驗證',mode:'sketch',sketchPlane:'XY',sketchProfiles:[{type:'poly',ell,pts:ellipseSample(ell)}],skCons:[],sketchTool:'select'},true)
await g().createSketchPattern({kind:'rectangular',nx:2,ny:1,dx:40,dy:0})
await writeFile('../../outputs/橢圓-可見操作驗證.json',JSON.stringify(buildProjectPayload(g()),null,2))
