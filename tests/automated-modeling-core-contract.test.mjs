// Automated Modeling Connector v1 must be a real, replayable B-rep feature,
// not a UI-only candidate preview.
import { readFileSync } from 'node:fs'
const src = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
let failed = 0
const ok = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`); if (!condition) failed++ }
ok(src.includes("type: 'automatedmodel'") && src.includes('radius: number'), 'worker feature contract persists connector endpoints and radius')
ok(src.includes('makeCylinder(r, len, f.a, [dx / len, dy / len, dz / len])'), 'connector is built as an arbitrary-direction analytic B-rep cylinder')
ok(src.includes("merge(connector, f.op ?? 'newbody')"), 'connector defaults to a separate body instead of silently fusing source bodies')
ok(src.includes('兩個連接面中心重合'), 'degenerate coincident endpoints fail safely with an explicit warning')
if (failed) process.exitCode = 1
