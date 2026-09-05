// SOLID keyboard/UI contract.  This deliberately tests the command dispatcher
// rather than a rendered snapshot: the shortcuts are global desktop-CAD
// behavior and must remain available when a command dialog owns a number field.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

test('SOLID dialogs keep Enter/Escape active while a numeric input is focused', () => {
  assert.match(app, /const editingText = !!t && \(t\.tagName === 'INPUT' \|\| t\.tagName === 'TEXTAREA'\)/)
  assert.match(app, /editingText && !e\.ctrlKey && !e\.metaKey && e\.key !== 'Enter' && e\.key !== 'Escape'/)
})

test('SOLID command dialogs have explicit commit/cancel keyboard branches', () => {
  const required = [
    ['edgeRoundPick', 'commitEdgeRound', 'cancelEdgeRound'],
    ['shellMode', 'commitShell', 'cancelShell'],
    ['pushPullMode', 'commitPushPull', 'togglePushPull'],
    ['faceFilletMode', 'commitFaceFillet', 'cancelFaceFillet'],
    ['holeMode', 'commitHole', 'cancelHole'],
    ['featDlg', 'commitFeatDlg', 'cancelFeatDlg'],
    ['extrudeDlgOpen', 'extrudeSketch', 'cancelExtrudeDlg'],
    ['sweepDlgOpen', 'commitSweepPath', 'cancelSweepDlg'],
    ['loftDlgOpen', 'commitLoft', 'cancelLoftDlg'],
    ['moveFaceMode', 'commitMoveFace', 'toggleMoveFace'],
    ['draftPickMode', 'finishDraftPick', 'toggleDraftPick'],
  ]
  for (const [state, commit, cancel] of required) {
    const start = app.indexOf(`if (s.${state})`)
    assert.ok(start >= 0, `${state} must be keyboard-routable`)
    const block = app.slice(start, start + 500)
    assert.match(block, new RegExp(`e\\.key === 'Enter'[\\s\\S]*${commit}\\(`), `${state}: Enter commits`)
    assert.match(block, new RegExp(`e\\.key === 'Escape'[\\s\\S]*${cancel}\\(`), `${state}: Escape cancels`)
  }
})

test('global desktop-CAD shortcuts cover undo/redo and primary SOLID workflows', () => {
  for (const command of ['extrude', 'fillet', 'chamfer', 'move', 'hole']) {
    assert.match(app, new RegExp(`runCommand\\('${command}'`), `${command} shortcut must route through command gate`)
  }
  assert.match(app, /ck === 'z' && !e\.shiftKey/)
  assert.match(app, /ck === 'y' \|\| \(ck === 'z' && e\.shiftKey\)/)
  assert.match(app, /case 's': if \(e\.shiftKey\) s\.startSketch\(\); else s\.setCmdPalette\(true\)/)
  assert.match(app, /case 'i': if \(s\.mode === 'model'\) s\.toggleInspect\(\)/)
})

test('direct-edit pick modes do not leak when Escape is pressed', () => {
  const cancellable = [
    ['rotateFaceMode', 'toggleRotateFace'], ['ucsPick', 'toggleUCSPick'],
    ['delFaceMode', 'toggleDelFace'], ['splitPlanePick', 'toggleSplitPlanePick'],
    ['thickenMode', 'toggleThicken'], ['offsetSurfMode', 'toggleOffsetSurf'],
    ['extendSurfMode', 'toggleExtendSurf'], ['splitFaceMode', 'toggleSplitFace'],
    ['replaceFaceMode', 'toggleReplaceFace'], ['surfTrimMode', 'toggleSurfSurfTrim'],
    ['patchMode', 'togglePatch'],
  ]
  for (const [state, cancel] of cancellable) {
    assert.match(app, new RegExp(`s\\.${state} && e\\.key === 'Escape'[\\s\\S]*${cancel}\\(`), `${state} must cancel on Escape`)
  }
})

test('Construct, Inspect, Surface, and Assembly pick modes have an explicit Escape exit', () => {
  const cancellable = [
    ['boundaryPatchPick', 'cancelBoundaryPatch'], ['surfBridgePick', 'cancelSurfBridge'],
    ['quiltPickMode', 'quiltPickMode: false'], ['editPolesMode', 'toggleEditPoles'],
    ['faceMateMode', 'cancelFaceMate'], ['jointPickMode', 'cancelJointPick'],
    ['jointOriginPickMode', 'cancelJointOriginPick'], ['screwFitMode', 'screwFitMode: false'],
    ['jointHolePick', 'jointHolePick: null'],
  ]
  for (const [state, cancel] of cancellable) {
    const start = app.indexOf(`if (s.${state} && e.key === 'Escape')`)
    assert.ok(start >= 0, `${state} must be keyboard-routable`)
    assert.ok(app.slice(start, start + 250).includes(cancel), `${state} must cancel on Escape`)
  }
  assert.match(app, /s\.measureMode \|\| s\.measureEdgeMode \|\| s\.measureFaceMode \|\| s\.measureAngleMode \|\| s\.measureUniMode/)
  assert.match(app, /measureUniMode: false/)
})

test('ribbon command UI exposes command identity and prevents commands behind a modal gate', () => {
  assert.match(ribbon, /data-cmd=\{t\.id\}/)
  assert.match(ribbon, /disabled=\{off\}/)
  assert.match(ribbon, /s\.faceFilletMode/)
  assert.match(ribbon, /s\.draftPickMode > 0/)
  assert.match(ribbon, /SKETCH_OK_CMDS/)
})
