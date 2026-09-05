// GM-L2 #85：ASCII STL 数字格式化 — ≥1e6 整数坐标唔可以被贪婪剔尾零截断（bug: 1000000 → 1）。
// 兼验常规坐标(40/1000/12.5)仍正确剪零 + NaN/Inf → '0' 唔破坏 ASCII。照 units.test.mjs 风格。
// 跑法：node --experimental-strip-types tests/stl-format.test.mjs
import { meshToAsciiSTL, parseSTL } from '../src/io/stl.ts'

let pass = 0, fail = 0
const rows = []
const ck = (name, cond, detail) => { rows.push([cond ? 'PASS' : 'FAIL', name, detail ?? '']); cond ? pass++ : fail++ }
const enc = (s) => new TextEncoder().encode(s).buffer
const eq = (a, b) => Math.abs(a - b) < 1e-3

// 单三角，坐标含 ≥1e6 大数 + 常规 mm 值 + 细小数/整百/零
const mesh = {
  vertices: [
    1000000, 1500000, -2000000,   // v0：#85 触发值（整数无小数点，会被贪婪 trim 截断）
    40, 12.5, 1000,               // v1：常规 mm（应正确剪零：40.00000→40, 1000.000→1000）
    0.0001, 100, 0,               // v2：细数 + 整百 + 零
  ],
  normals: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  triangles: [0, 1, 2],
}

const ascii = meshToAsciiSTL(mesh)
const firstVertex = ascii.match(/vertex[^\n]*/)?.[0]
// 直接 token 检查：大整数原样输出、无截断（buggy 会写成 "vertex 1 15 -2"）
ck('保留 1000000（唔截成 1）', /\b1000000\b/.test(ascii) && !/vertex 1 /.test(ascii), firstVertex)
ck('保留 1500000（唔截成 15）', /\b1500000\b/.test(ascii))
ck('保留 -2000000（唔截成 -2）', /-2000000\b/.test(ascii))
ck('常规值剪零 40（唔留 40.00000）', /\b40\b/.test(ascii) && !/40\.0/.test(ascii))
ck('常规值剪零 1000（唔留 1000.000）', /\b1000\b/.test(ascii) && !/1000\.0/.test(ascii))
ck('细数 0.0001 保留', /0\.0001\b/.test(ascii))

// 往返：format → parse，坐标要一致（7 位有效数字内）
const back = parseSTL(enc(ascii))
ck('往返 v0.x = 1000000', eq(back.vertices[0], 1000000), back.vertices[0])
ck('往返 v0.y = 1500000', eq(back.vertices[1], 1500000), back.vertices[1])
ck('往返 v0.z = -2000000', eq(back.vertices[2], -2000000), back.vertices[2])
ck('往返 v1 = [40,12.5,1000]', eq(back.vertices[3], 40) && eq(back.vertices[4], 12.5) && eq(back.vertices[5], 1000), back.vertices.slice(3, 6).join(','))
ck('往返 v2 = [0.0001,100,0]', eq(back.vertices[6], 0.0001) && eq(back.vertices[7], 100) && eq(back.vertices[8], 0), back.vertices.slice(6, 9).join(','))

// NaN/Infinity → '0'，唔可以写出 "NaN"/"Infinity" 破坏 ASCII STL（bt3 守卫回归）
const bad = { vertices: [NaN, Infinity, -Infinity, 0, 0, 0, 1, 1, 1], normals: new Array(9).fill(0), triangles: [0, 1, 2] }
const asciiBad = meshToAsciiSTL(bad)
ck('NaN/Inf → 无 "NaN" token', !/NaN/i.test(asciiBad))
ck('NaN/Inf → 无 "Infinity" token', !/Infinity/i.test(asciiBad))

console.log('\n========== PASS/FAIL 总表 ==========')
for (const [st, n, d] of rows) console.log(`  ${st}  ${n}${d !== '' ? '  (' + d + ')' : ''}`)
console.log('====================================')
console.log(fail === 0 ? `全部 ${pass} 项通过` : `${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
