/**
 * v1.21 P1: DXF TEXT/MTEXT must not be silently dropped — parse into ImpText annotations
 * and wire construction markers + sketchSources.labels on import.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  parseDxfToProfiles,
  stripMtextFormatting,
  textsToConstructionShapes,
  shiftTexts,
  profilesRecenterOffset,
} from '../src/io/dxfImport.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const sketchLayer = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')

test('APP_VERSION is a release string (≥1.21)', () => {
  assert.match(version, /APP_VERSION = '\d+\.\d+'/)
})

test('stripMtextFormatting drops control codes', () => {
  assert.equal(stripMtextFormatting('{\\fArial|b0|i0;L1}'), 'L1')
  assert.equal(stripMtextFormatting('A\\PB'), 'A B')
})

function dxfWithText() {
  return `0
SECTION
2
ENTITIES
0
LWPOLYLINE
8
0
90
4
70
1
10
0
20
0
10
40
20
0
10
40
20
20
10
0
20
20
0
TEXT
8
LABELS
10
5
20
12
40
3.5
1
PHASE A
0
MTEXT
8
LABELS
10
25
20
8
40
2.5
1
{\\fArial|b0;N}\\P{\\fArial|b0;12}
0
ENDSEC
0
EOF
`
}

test('parseDxfToProfiles retains TEXT and MTEXT (not skipped)', () => {
  const r = parseDxfToProfiles(dxfWithText())
  assert.ok(r.profiles.length >= 1, 'expect closed poly profile')
  assert.ok(r.texts.length >= 2, `expect TEXT+MTEXT, got ${JSON.stringify(r.texts)}`)
  assert.ok(!r.skipped.includes('TEXT'), `TEXT must not be skipped: ${r.skipped}`)
  assert.ok(!r.skipped.includes('MTEXT'), `MTEXT must not be skipped: ${r.skipped}`)
  const phase = r.texts.find((t) => t.text.includes('PHASE'))
  assert.ok(phase, 'TEXT content PHASE A')
  assert.ok(Math.abs(phase.at[0] - 5) < 1e-6 && Math.abs(phase.at[1] - 12) < 1e-6)
  assert.ok(Math.abs(phase.height - 3.5) < 1e-6)
  const m = r.texts.find((t) => /N/.test(t.text) && /12/.test(t.text))
  assert.ok(m, `MTEXT plain text expected, got ${JSON.stringify(r.texts)}`)
  assert.match(r.note, /文字标注/)
})

test('textsToConstructionShapes emits underline + point markers', () => {
  const shapes = textsToConstructionShapes([{ at: [1, 2], text: 'AB', height: 4 }])
  assert.equal(shapes.length, 2)
  assert.equal(shapes[0].type, 'circle')
  assert.equal(shapes[0].point, true)
  assert.equal(shapes[0].construction, true)
  assert.equal(shapes[1].type, 'poly')
  assert.equal(shapes[1].open, true)
  assert.equal(shapes[1].construction, true)
})

test('shiftTexts shares profile recenter offset', () => {
  const profiles = [{ kind: 'poly', pts: [[0, 0], [10, 0], [10, 10], [0, 10]] }]
  const [ox, oy] = profilesRecenterOffset(profiles)
  assert.ok(Math.abs(ox - 5) < 1e-9 && Math.abs(oy - 5) < 1e-9)
  const shifted = shiftTexts([{ at: [5, 12], text: 'X', height: 2 }], ox, oy)
  assert.ok(Math.abs(shifted[0].at[0]) < 1e-9)
  assert.ok(Math.abs(shifted[0].at[1] - 7) < 1e-9)
})

test('import path + SketchLayer wire labels (source contract)', () => {
  assert.match(storeSrc, /labels\?: \{ at: Pt; text: string/)
  assert.match(storeSrc, /保留 \$\{labels\.length\} 个文字标注/)
  assert.match(storeSrc, /texts/)
  assert.match(sketchLayer, /dxfLabels/)
  assert.match(sketchLayer, /dxfTxt/)
})
