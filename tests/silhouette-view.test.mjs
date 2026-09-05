import { projectViewSilhouette } from '../src/geom/projectSilhouette.ts'

let fail = 0
const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++ }

// A box with every quad triangulated.  Top projection must return its outer
// outline, not the two diagonal tessellation edges on the caps.
const v = [
  0, 0, 0,  10, 0, 0,  10, 10, 0,  0, 10, 0,
  0, 0, 8,  10, 0, 8,  10, 10, 8,  0, 10, 8,
]
const t = [
  0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
  0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
  2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
]
const top = projectViewSilhouette({ vertices: v, triangles: t }, 'XY')
ok(top.length === 4, '頂視 box 輪廓只保留四條外邊，忽略 cap 三角對角線')
ok(top.every(([a, b]) => Math.abs(a[0] - b[0]) < 1e-9 || Math.abs(a[1] - b[1]) < 1e-9), '頂視輪廓沒有斜向 tessellation 邊')

// A sheet has no opposing neighbour face, so its boundary remains a usable
// silhouette rather than disappearing.
const sheet = projectViewSilhouette({ vertices: v.slice(0, 12), triangles: [0, 1, 2, 0, 2, 3] }, 'XY')
ok(sheet.length === 4, '開放曲面保留其 boundary 輪廓')

if (fail) process.exitCode = 1
