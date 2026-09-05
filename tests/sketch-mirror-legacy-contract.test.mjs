import fs from 'node:fs'

const src = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
let failed = 0
const ok = (condition, message) => { console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`); if (!condition) failed++ }

ok(src.includes('sketchMirror: (axis) => get().mirrorSketch(axis)'), 'legacy keyboard sketchMirror delegates to the multi-profile-safe mirror implementation')
ok(src.includes('sketchProfiles: [...s.sketchProfiles, s.sketchShape, ...mirrors.slice(0, -1)]'), 'active-shape mirror preserves existing committed profiles')
ok(src.includes('sketchProfiles: [...s.sketchProfiles, ...mirrors], sketchShape: null'), 'profile-only mirror preserves every source contour')
ok(!src.includes('sketchProfiles: [base, mir(base)]'), 'legacy mirror no longer overwrites all profiles with one source and one copy')

if (failed) process.exitCode = 1
