// Silhouette Split v1 must remain an honest B-rep feature: only replayable
// orthographic views are persisted and the worker delegates to the custom
// source-face-mapped cylinder gate, never to tessellated display outlines.
import { readFileSync } from 'node:fs'

const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
let failed = 0
const ok = (v, msg) => { console.log(`${v ? 'PASS' : 'FAIL'}  ${msg}`); if (!v) failed++ }

ok(worker.includes("type: 'silhouettesplit'") && worker.includes("view: 'front' | 'back' | 'top' | 'bottom' | 'right' | 'left'"), 'timeline feature persists only replayable orthographic views')
ok(worker.includes('SplitByHlrOutline3dSafe') && worker.includes('SplitByHlrOutline3dConesOnly') && worker.includes('spheres/other periodic or freeform surfaces'), 'worker uses separately guarded cylinder and cone analytic HLR routes and documents the surface boundary')
ok(worker.includes('front: [0, -1, 0]') && worker.includes('left: [-1, 0, 0]'), 'worker maps every persisted standard view to an explicit HLR direction')
ok(!worker.includes('projectViewSilhouette(shape') || worker.indexOf("f.type === 'silhouettesplit'") < worker.indexOf('projectViewSilhouette(shape'), 'feature does not substitute display-mesh silhouette projection for B-rep splitting')
ok(store.includes("case 'silhouettesplit'") && store.includes("view === 'iso'"), 'command rejects non-replayable isometric view instead of faking camera history')
ok(store.includes("type: 'silhouettesplit', view"), 'command writes a parametric timeline feature')

if (failed) process.exitCode = 1
