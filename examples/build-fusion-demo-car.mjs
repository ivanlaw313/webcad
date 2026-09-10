// Run from repository root:
// node --experimental-strip-types --import ./tests/register-resolver.mjs examples/build-fusion-demo-car.mjs /absolute/output.json
// No imported meshes or STEP features: every display mesh is rebuilt by the application's real CAD worker.
import fs from 'node:fs/promises';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('../tests',import.meta.url));register('../tests/native-car-loader.mjs',import.meta.url);
await import('../src/worker/cad.worker.ts');const worker=globalThis.__wheelWorker;await worker.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');
const recipe=JSON.parse(await fs.readFile(new URL('./fusion-demo-car-native.json',import.meta.url),'utf8'));
const components=[];
for(const part of recipe.components){const mesh=await worker.rebuild(part.src.features);if(mesh.failed?.length)throw Error(part.name+': '+JSON.stringify(mesh.failed));components.push({...part,mesh});console.log('Rebuilt',part.name,part.src.features.length);}
useApp.setState({...useApp.getInitialState(),projectName:recipe.projectName,components,viewBookmarks:recipe.viewBookmarks,visualStyle:'shadedVisible',edgeDisplay:'on',bgPreset:'studio'},true);
const output=process.argv[2];if(!output)throw Error('Supply an output JSON path');await fs.writeFile(output,JSON.stringify(buildProjectPayload(useApp.getState()))+'\n');console.log('Saved',output);
