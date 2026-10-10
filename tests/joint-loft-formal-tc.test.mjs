/**
 * Joints panel Formal Traditional (no bilingual EN titles) + loft rails empty-hint /
 * visibility gate (≥2 sections before rail pick). APP_VERSION stays 2.20.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const jp = readFileSync(new URL('../src/components/JointsPanel.tsx', import.meta.url), 'utf8')
const loft = readFileSync(new URL('../src/components/LoftSectionList.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')

test('APP_VERSION 2.20', () => {
  assert.match(version, /APP_VERSION = '2\.20'/)
})

test('JointsPanel titles are Formal Traditional without bilingual EN', () => {
  assert.match(jp, />關鍵幀動畫</)
  assert.match(jp, />捕捉位置</)
  assert.match(jp, />剛性組</)
  assert.match(jp, />關節原點</)
  assert.doesNotMatch(jp, /Keyframe Animation/)
  assert.doesNotMatch(jp, /Capture Position/)
  assert.doesNotMatch(jp, /Rigid Group/)
  assert.doesNotMatch(jp, /關節原點（Joint Origins）/)
  assert.doesNotMatch(jp, /> Flip</)
  assert.doesNotMatch(jp, /Rest 靜止位/)
  assert.doesNotMatch(jp, /清除 Motion Study/)
  assert.doesNotMatch(jp, /\(Keyframe Animation\)/)
  assert.match(jp, /> 反轉</)
  assert.match(jp, /靜止位（\$\{j\.type/)
  assert.match(jp, /清除運動研究軌跡/)
})

test('Loft rails: pick only when ≥2 sections; Formal Traditional empty hints', () => {
  assert.match(loft, /data-testid="loft-rail-row"/)
  assert.match(loft, /sections\.length >= 2 && railCands\.length/)
  assert.match(loft, /請先加入至少兩個截面，方可選用導軌/)
  assert.match(loft, /尚無可選導軌：請在 XY 平面草圖繪製連接各截面的開放折線（點數＝截面數）/)
  assert.doesNotMatch(loft, /導軌：先加滿/)
  assert.doesNotMatch(loft, /可選：選一條連接各截面的曲線/)
})

test('Sketch ribbon tip points to SURFACE 相交曲線 for body-body intersect', () => {
  assert.match(ribbon, /SURFACE → CREATE → 相交曲線/)
  assert.match(ribbon, /id: 'sk_project'/)
})
