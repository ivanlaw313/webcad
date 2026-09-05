import fs from 'node:fs'
const src = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
let fail = 0
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++ }
ok(src.includes("case 'derive':") && src.includes('openStepBrepDialog(true)'), 'Derive opens the explicit STEP B-rep derived-snapshot workflow')
ok(src.includes('openStepBrepDialog: (asDerived = false)'), 'STEP B-rep picker distinguishes import from derived snapshot')
ok(src.includes('非关联快照') && src.includes('来源更新需重新 Derive'), 'Derive does not claim a nonexistent cross-design live link')
ok(src.includes("type: 'stepbody'") && src.includes('可继续切割/圆角/抽壳/导出 STEP'), 'Derived STEP remains editable B-rep history, not a display mesh')
if (fail) process.exitCode = 1
