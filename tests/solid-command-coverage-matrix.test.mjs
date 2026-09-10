// SOLID command coverage matrix.
//
// This is intentionally derived from the ribbon, rather than a hand-maintained
// list: adding a visible SOLID command without a dispatcher route, a command
// gate, or a way back out of the operation fails CI.  It is the baseline for
// the browser/manual matrix (numeric dialog, pick/drag, Escape and Undo).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { WORKSPACES } from '../src/ribbon.ts'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

const leafTools = (group) => {
  const panel = WORKSPACES.SOLID.panels.find((p) => p.name === group)
  assert.ok(panel, `SOLID ${group} panel exists`)
  return panel.tools.flatMap((tool) => tool.children?.length ? tool.children : [tool])
}

const commandCase = (id) => {
  const start = store.indexOf(`case '${id}':`)
  assert.ok(start >= 0, `${id} has a runCommand route`)
  const next = store.indexOf("case '", start + 6)
  return store.slice(start, next < 0 ? start + 2800 : next)
}

test('every visible SOLID Create, Modify and Assemble leaf command is executable', () => {
  for (const group of ['CREATE', 'MODIFY', 'ASSEMBLE']) {
    for (const tool of leafTools(group)) {
      const body = commandCase(tool.id)
      // A case that merely falls through is a deceptively visible dead command.
      assert.match(body, /(return|get\(\)\.|set\(|await |void )/, `${group}/${tool.id} starts an operation`)
    }
  }
})

test('visible SOLID commands retain the modal/pick safety gate and command identity', () => {
  assert.match(ribbonUi, /data-cmd=\{t\.id\}/)
  assert.match(ribbonUi, /disabled=\{off\}/)
  // Shared gate protects unconfirmed drafts across every command entry point.
  // Real state preservation and cancellation are exercised by contextual-command-workflow.
  assert.match(store, /runCommand: async \(id, label\) =>/)
  assert.match(store, /commandDisabledReason\(get\(\), id\)/)
  assert.match(ribbonUi, /commandDisabledReason\(/)

})

test('the direct-edit SOLID workflows have keyboard commit/cancel and global Undo/Redo', () => {
  const dialogOrPickStates = [
    ['edgeRoundPick', 'commitEdgeRound', 'cancelEdgeRound'],
    ['shellMode', 'commitShell', 'cancelShell'],
    ['pushPullMode', 'commitPushPull', 'togglePushPull'],
    ['faceFilletMode', 'commitFaceFillet', 'cancelFaceFillet'],
    ['holeMode', 'commitHole', 'cancelHole'],
    ['extrudeDlgOpen', 'extrudeSketch', 'cancelExtrudeDlg'],
    ['sweepDlgOpen', 'commitSweepPath', 'cancelSweepDlg'],
    ['loftDlgOpen', 'commitLoft', 'cancelLoftDlg'],
    ['moveFaceMode', 'commitMoveFace', 'toggleMoveFace'],
    ['draftPickMode', 'finishDraftPick', 'toggleDraftPick'],
  ]
  for (const [state, commit, cancel] of dialogOrPickStates) {
    const start = app.indexOf(`if (s.${state})`)
    assert.ok(start >= 0, `${state} is keyboard-routable`)
    const body = app.slice(start, start + 650)
    assert.match(body, new RegExp(`e\\.key === 'Enter'[\\s\\S]*${commit}\\(`), `${state}: Enter commits`)
    assert.match(body, new RegExp(`e\\.key === 'Escape'[\\s\\S]*${cancel}\\(`), `${state}: Escape cancels`)
  }
  assert.match(app, /ck === 'z' && !e\.shiftKey/)
  assert.match(app, /ck === 'y' \|\| \(ck === 'z' && e\.shiftKey\)/)
})

test('manual browser matrix has stable anchors for numeric create, cancel, display and timeline undo', () => {
  const e2e = readFileSync(new URL('./e2e/solid-ui-workflow.playwright.mjs', import.meta.url), 'utf8')
  for (const anchor of ['?ui-test=1', '[data-cmd="box"]', "fill('40')", "press('Escape')", 'Control+z', 'Control+y', 'data-feature-count']) {
    assert.ok(e2e.includes(anchor), `manual/browser matrix anchor: ${anchor}`)
  }
})
