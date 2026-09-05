import fs from 'node:fs'
const src = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
let fail = 0
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++ }
const block = src.match(/case 'basefeature': \{([\s\S]*?)\n      \}/)?.[1] || ''
ok(block.includes('cad.exportSTEP()'), 'Base Feature captures the live B-rep as STEP, not a display mesh')
ok(block.includes("type: 'stepbody'") && block.includes('applyFeatures([base]'), 'Base Feature replays as a parametric timeline base node')
ok(block.includes('appConfirm') && block.includes('docSnap'), 'Base Feature requires destructive-history confirmation and preserves one-step Undo')
ok(block.includes('sketchSources: {}') && block.includes('paramBindings: {}'), 'Base Feature clears dangling pre-base sketch and parameter references')
if (fail) process.exitCode = 1
