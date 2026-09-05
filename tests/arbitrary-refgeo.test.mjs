import { arbitraryPlaneSection } from '../src/geom/arbitraryPlaneSection.ts'

let fail = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

// Closed 10 x 10 x 10 box, CAD Z-up.  Every face is split into two triangles,
// matching the production mesh format.
const mesh = {
  vertices: [0,0,5, 10,0,5, 10,10,5, 0,10,5, 0,0,15, 10,0,15, 10,10,15, 0,10,15],
  triangles: [0,1,2, 0,2,3, 4,6,5, 4,7,6, 0,4,5, 0,5,1, 2,6,7, 2,7,3, 0,3,7, 0,7,4, 1,5,6, 1,6,2],
}

const mid = arbitraryPlaneSection(mesh, { o: [0, 5, 0], xd: [1, 0, 0], n: [0, 1, 0] })
ok(!!mid && mid.segs.length >= 4, 'arbitrary vertical datum returns a real mesh section')
const points = mid ? mid.segs.flat() : []
const xs = points.map((p) => p[0]), ys = points.map((p) => p[1])
ok(Math.min(...xs) === 0 && Math.max(...xs) === 10, 'section local x range matches the body')
ok(Math.min(...ys) === -15 && Math.max(...ys) === -5, 'section local y follows normal × xDir frame')

const coplanar = arbitraryPlaneSection(mesh, { o: [0, 0, 5], xd: [1, 0, 0], n: [0, 0, 1] })
ok(!!coplanar && coplanar.segs.length === 4, 'coplanar arbitrary face returns only its outer boundary')

const miss = arbitraryPlaneSection(mesh, { o: [0, 0, 30], xd: [1, 0, 0], n: [0, 0, 1] })
ok(miss === null, 'an arbitrary plane away from the body does not fabricate a projection')

console.log(fail === 0 ? '\nall passed' : `\n${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
