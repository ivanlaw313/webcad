/** 倒角距離欄視覺：99999 必須完整顯示（唔裁成 999）；唔設 maxLength／靜默夾值。 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CHAMFER_DIST_INPUT_W, chamferDistDraftShown, chamferDistWidthShowsFiveDigits } from '../src/ui/chamferDistDisplay.ts'

const rd = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

test('policy: five-digit draft shown verbatim; width ≥88', () => {
  assert.equal(chamferDistDraftShown('99999'), '99999')
  assert.equal(chamferDistDraftShown('9'), '9')
  assert.equal(CHAMFER_DIST_INPUT_W, 88)
  assert.equal(chamferDistWidthShowsFiveDigits(66), false)
  assert.equal(chamferDistWidthShowsFiveDigits(88), true)
  assert.equal(chamferDistWidthShowsFiveDigits(100), true)
})

test('Viewport chamfer distance / dist2 / edit use CHAMFER_DIST_INPUT_W; LenInput overflow visible; no maxLength', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /import \{ CHAMFER_DIST_INPUT_W \} from '\.\.\/ui\/chamferDistDisplay'/)
  assert.match(vp, /title="倒角距離[^"]*"[\s\S]{0,5}\/>/)
  assert.match(vp, /w=\{CHAMFER_DIST_INPUT_W\} min=\{0\} max=\{1000000\} title="倒角距離/)
  assert.match(vp, /w=\{CHAMFER_DIST_INPUT_W\} min=\{0\} title="倒角第二距離"/)
  assert.match(vp, /FeatNum k="distance" v=\{featDlg\.params\.distance\} w=\{CHAMFER_DIST_INPUT_W\}/)
  assert.match(vp, /FeatNum k="dist2" v=\{featDlg\.params\.dist2\} w=\{CHAMFER_DIST_INPUT_W\}/)
  assert.equal((vp.match(/w=\{CHAMFER_DIST_INPUT_W\}/g) || []).length, 4)
  // LenInput: growing width (31fbeb4) + boxSizing/overflow visible (ffe4591)
  assert.match(vp, /Math\.max\(w, 12 \+ shown\.length \* 14\)/)
  assert.match(vp, /boxSizing: 'border-box', overflow: 'visible'/)
  assert.doesNotMatch(vp, /maxLength=\{/)
})

test('timeline feat-editor input width ≥88 with overflow visible', () => {
  const css = rd('src/index.css')
  assert.match(css, /\.feat-editor input \{[^}]*width:\s*88px/)
  assert.match(css, /\.feat-editor input \{[^}]*overflow:\s*visible/)
  assert.match(css, /\.feat-editor input \{[^}]*box-sizing:\s*border-box/)
})
