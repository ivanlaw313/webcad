// RETEST17 #5：拉伸「兩側」（10 / 5）成功狀態唔可以報「（對稱）」— 要報兩側 + 兩個距離。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { extrudeExtraNote } from '../src/ui/featureStatus.ts'

test('two-sides note names both distances and never says symmetric', () => {
  const n = extrudeExtraNote({ symmetric: true }, [10, 5])
  assert.equal(n, '（兩側 側1 10 · 側2 5 mm）')
  assert.doesNotMatch(n, /對稱|对称/)
  assert.equal(extrudeExtraNote({ symmetric: true, draft: 2 }, [10, 5]), '（兩側 側1 10 · 側2 5 mm）（拔模 2°）')
  assert.equal(extrudeExtraNote({ symmetric: true }), '（对称）', 'real symmetric keeps its note')
  assert.equal(extrudeExtraNote({ twist: 15 }), '（扭转 15°）')
  assert.equal(extrudeExtraNote({ through: true }), '（贯通）')
  assert.equal(extrudeExtraNote({}), '')
})

test('extrude commit passes the two-side distances into the status', () => {
  const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(st, /twoSidesNote = \[side1, side2\]/)
  assert.match(st, /const extra = extrudeExtraNote\(f as [^,]+, opts\?\.twoSides\)/)
  assert.match(st, /twoSides: twoSidesNote,\n\s*\}\)/)
  assert.match(st, /'intersect', effBaseZ, \{ twist, symmetric, plane, draft, down, twoSides: twoSidesNote \}/)
  assert.doesNotMatch(st, /const extra = \(f\.symmetric \? '（对称）'/)
})
