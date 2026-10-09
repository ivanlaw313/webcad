// RETEST17 #1：關節類型唔再係「輸入編號」prompt — 改為可點選清單（Fusion Joint ▸ Type 下拉），8 類、繁體。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { jointTypePickOptions, jointTypeMenu, ALL_JOINT_TYPES } from '../src/assembly/kinematics.ts'

test('pick options: all 8 types, Traditional labels + DOF hints, preferred first = default', () => {
  const opts = jointTypePickOptions(jointTypeMenu(['revolute', 'slider', 'cylindrical']))
  assert.equal(opts.length, 8)
  assert.deepEqual(new Set(opts.map((o) => o.value)), new Set(ALL_JOINT_TYPES))
  assert.deepEqual(opts.slice(0, 3).map((o) => o.value), ['revolute', 'slider', 'cylindrical'])
  assert.equal(opts[0].label, '旋轉（預設）')
  assert.deepEqual(opts.slice(1).map((o) => o.label), ['滑動', '圓柱', '銷槽', '球', '平面', '螺旋', '剛性'])
  for (const o of opts) { assert.ok(o.hint && /自由度/.test(o.hint)); assert.doesNotMatch(o.label + o.hint, /[转动圆销刚绕轴节]/u) }
  const planar = jointTypePickOptions(jointTypeMenu(['rigid', 'planar']))
  assert.equal(planar[0].value, 'rigid'); assert.equal(planar[0].label, '剛性（預設）'); assert.equal(planar.length, 8)
  assert.equal(jointTypePickOptions(['ball'], (s) => `<${s}>`)[0].label, '<球（預設）>', 'labels go through the language converter')
})

test('face-pick joint flow uses appPick (clickable list), not a numbered prompt', () => {
  const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(st, /關節類型（輸入編號）/)
  assert.match(st, /get\(\)\.appPick\(tStatus\('選擇關節類型[^']*', lang0\), jointTypePickOptions\(allowTypes/)
  assert.match(st, /const type: JointType = \(allowTypes as string\[\]\)\.includes\(r\) \? \(r as JointType\) : defType/)
  assert.match(st, /appPick: \(msg, options, def, title = '選擇'\) => new Promise/)
  assert.match(st, /kind: 'prompt' \| 'confirm' \| 'alert' \| 'pick'/)
})

test('PromptDialog renders a listbox of clickable options (click = choose, ↑↓/Enter keyboard)', () => {
  const pd = readFileSync(new URL('../src/components/PromptDialog.tsx', import.meta.url), 'utf8')
  assert.match(pd, /role="listbox"/)
  assert.match(pd, /role="option" aria-selected=\{on\}/)
  assert.match(pd, /onClick=\{\(\) => resolveDialog\(o\.value\)\}/)
  assert.match(pd, /e\.key === 'ArrowDown' \|\| e\.key === 'ArrowUp'/)
})
