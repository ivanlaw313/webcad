// RETEST17 #4：裝配 HUD 質心要報 CAD 坐標（Z-up），同 W×D×H 一致 — 舊版直接報 three (Y-up) → Y/Z 對調。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Matrix4 } from 'three'
import { assemblyMassSummary, threeToCadPoint } from '../src/assembly/asmMass.ts'

function box(x0, y0, z0, dx, dy, dz) {
  const v = [], t = []
  const P = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]]
  for (const [a,b,c] of P) v.push(x0 + a*dx, y0 + b*dy, z0 + c*dz)
  const F = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]
  for (const f of F) t.push(...f)
  return { vertices: v, triangles: t }
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e

test('50×40×40 part standing on Z: centroid reported (x, y, z) in CAD = (0, 5, 20) not swapped', () => {
  // CAD: x −25..25, y −15..25 (centre 5), z 0..40 (height along Z)
  const cad2three = new Matrix4().makeRotationX(-Math.PI / 2)   // compWorldMatrix frame (pos 0, no rot)
  const s = assemblyMassSummary([{ meshes: [box(-25, -15, 0, 50, 40, 40)], M: cad2three.elements }])
  const c = threeToCadPoint(s.centroid)
  assert.ok(near(c[0], 0) && near(c[1], 5) && near(c[2], 20), `got ${c}`)
  // three-frame raw centroid would have been (0, 20, −5) — the old swapped readout
  assert.ok(near(s.centroid[1], 20) && near(s.centroid[2], -5))
  // consistent with W×D×H: D = CAD y extent = three z extent, H = CAD z = three y
  assert.ok(near(s.max[2] - s.min[2], 40) && near(s.max[1] - s.min[1], 40) && near(s.max[0] - s.min[0], 50))
})

test('threeToCadPoint is the inverse of the CAD→three frame and never prints −0', () => {
  assert.deepEqual(threeToCadPoint([1, 2, 3]), [1, -3, 2])
  const z = threeToCadPoint([0, 7.1, 0])
  assert.ok(Object.is(z[1], 0), 'no negative zero')
  assert.deepEqual(z, [0, 0, 7.1])
})

test('assembly HUD uses threeToCadPoint for the centroid', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /const comCad = wsum > 0 \? threeToCadPoint\(\[cmx \/ wsum, cmy \/ wsum, cmz \/ wsum\]\) : null/)
  assert.doesNotMatch(vp, /質心 \(\$\{uLen\(cmx \/ wsum\)\}/)
})
