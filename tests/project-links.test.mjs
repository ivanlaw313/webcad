import { refreshSafeProjectLinks } from '../src/sketch/projectLinks.ts'

let fail = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }
const linked = { type: 'poly', pts: [[0, 0], [10, 0], [10, 10], [0, 10]], projected: true, projectLink: 'all' }
const ref = { segs: [[[2, 2], [12, 2]], [[12, 2], [12, 12]], [[12, 12], [2, 12]], [[2, 12], [2, 2]]] }

const refreshed = refreshSafeProjectLinks([linked, { type: 'circle', c: [30, 30], r: 2 }], ref, [])
ok(refreshed.refreshed === 1 && refreshed.held === 0, 'unconstrained same-topology Project All refreshes')
ok(refreshed.shapes[0].type === 'poly' && refreshed.shapes[0].pts[0][0] === 2, 'refresh replaces coordinates but keeps the linked shape slot')

const heldConstraint = refreshSafeProjectLinks([linked], ref, [{ a: { kind: 'edge', shape: 0 } }])
ok(heldConstraint.refreshed === 0 && heldConstraint.held === 1, 'a constrained projected curve is never silently retargeted')

const changedTopology = refreshSafeProjectLinks([linked], { segs: [[[2, 2], [12, 2]], [[12, 2], [12, 12]]] }, [])
ok(changedTopology.refreshed === 0 && changedTopology.held === 1, 'a topology change holds the previous linked curve explicitly')

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
