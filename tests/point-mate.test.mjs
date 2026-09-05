import { Matrix4, Vector3 } from 'three'
import { solvePointMateDelta } from '../src/assembly/faceMate.ts'

let pass = 0, fail = 0
const ok = (condition, message) => { if (condition) pass++; else { fail++; console.log('  ✗', message) } }
const near = (actual, expected, tolerance, message) => ok(Math.abs(actual - expected) <= tolerance, `${message}: expected ${expected}±${tolerance}, got ${actual}`)

// Align 点对点：移动件的拾取点必须精确落到基准件的拾取点；不应偷偷引入旋转。
const reference = { p: [18, -7, 42] }
const moving = { p: [-4, 10, 3] }
const delta = solvePointMateDelta(reference, moving)
const aligned = new Vector3(...moving.p).applyMatrix4(delta)
near(aligned.x, reference.p[0], 1e-9, 'X point aligns')
near(aligned.y, reference.p[1], 1e-9, 'Y point aligns')
near(aligned.z, reference.p[2], 1e-9, 'Z point aligns')

const unitX = new Vector3(1, 0, 0).transformDirection(delta)
near(unitX.x, 1, 1e-12, 'point Align preserves X direction')
near(unitX.y, 0, 1e-12, 'point Align adds no rotation')
near(unitX.z, 0, 1e-12, 'point Align adds no rotation')

const identity = solvePointMateDelta({ p: [1, 2, 3] }, { p: [1, 2, 3] })
ok(identity.equals(new Matrix4()), 'identical points produce identity transform')

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
