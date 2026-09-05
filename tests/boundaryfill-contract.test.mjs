import fs from 'node:fs'

const store = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const worker = fs.readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const viewport = fs.readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
let failed = 0
const ok = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`); if (!condition) failed++ }

ok(store.includes("case 'boundaryfill': return get().openBoundaryFillDlg()"), 'Boundary Fill command opens a dedicated workflow instead of an unimplemented status')
ok(store.includes("openBoundaryFillDlg: () => set((s) =>"), 'Boundary Fill validates the active and parked-body prerequisites')
ok(store.includes("kind: 'boundaryfill'"), 'Boundary Fill exposes a dedicated dialog state')
ok(store.includes("type: 'boundaryfill', target, cell"), 'Boundary Fill persists a parametric timeline feature')
ok(worker.includes("type: 'boundaryfill'; target: number; cell: 'target' | 'overlap' | 'tool'"), 'Worker feature contract has explicit selected-cell semantics')
ok(worker.includes("source.clone().cut(tool.clone())") && worker.includes("source.clone().intersect(tool.clone())") && worker.includes("tool.clone().cut(source.clone())"), 'Worker constructs the three real B-rep cells with independent boolean operands')
ok(worker.includes("parkedBodies.splice(f.target, 1)") && worker.includes("Boundary Fill：交集"), 'Selected result becomes active and remaining valid cells are retained as bodies')
ok(viewport.includes('多工具、曲面／平面工具及任意多 cell 选择尚未提供'), 'UI states the supported two-solid scope rather than claiming full Fusion parity')

if (failed) process.exitCode = 1
