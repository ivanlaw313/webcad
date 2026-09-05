// Commercial CAD workflow contract: a history operation must rebuild the same
// leading feature prefix that the timeline shows, while edits rebuild the full
// tree and retain selection-dependent data such as pattern targets and face refs.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('timeline replay rebuilds the visible prefix and keeps datum state in sync', () => {
  const method = store.slice(store.indexOf('gotoStep: async'), store.indexOf("  view: 'iso'", store.indexOf('gotoStep: async')))
  assert.match(method, /const pos = Math\.max\(0, Math\.min\(Math\.round\(n\), total\)\)/)
  assert.match(method, /feats\.slice\(0, pos\)\.filter\(\(f\) => !sup\.includes\(f\.id\)\)/)
  assert.match(method, /timelinePos: pos/)
  assert.match(method, /planes: planesFromFeatures\(feats\.slice\(0, pos\), sup\)/)
})

test('rapid timeline scrubbing serializes rebuilds instead of dropping the final target', () => {
  assert.match(timeline, /if \(scrubBusy\.current\) \{ scrubPending\.current = idx; return \}/)
  assert.match(timeline, /if \(p >= 0 && p !== useApp\.getState\(\)\.timelinePos\) scrubTo\(p\)/)
})

test('feature edits retain dependent fields and rebuild the complete active history', () => {
  const edit = store.slice(store.indexOf('editFeature: async'), store.indexOf('  removeFeature: async', store.indexOf('editFeature: async')))
  assert.match(edit, /const merged = \{ \.\.\.f, \.\.\.clean/)
  assert.match(edit, /for \(const k of dels\) .*delete merged\[k\]/)
  assert.match(edit, /await get\(\)\.applyFeatures\(features, '已更新参数并重建'\)/)
  const rebuild = store.slice(store.indexOf('applyFeatures: async'), store.indexOf('  editFeature: async', store.indexOf('applyFeatures: async')))
  assert.match(rebuild, /const active = expandFeats\(/)
  assert.match(rebuild, /timelinePos: bound\.length/)
})

test('feature pattern snapshots its predecessor before replaying a cut feature', () => {
  assert.match(worker, /const snapBefore = \(_next && \(_next\.type === 'cpattern' \|\| _next\.type === 'pattern' \|\| _next\.type === 'pathpattern'\) && shape\)/)
  assert.match(worker, /\(_fIsCut && _cutRunStart\) \? _cutRunStart : shape\.clone\(\)/)
})

test('generic Feature Pattern rebuilds deltas for Revolve, Loft and other timeline feature targets', () => {
  // The generic command must not be narrowed to extrusion-only targets.  It takes the
  // selected live timeline IDs, then the kernel snapshots each referenced feature's
  // before/after B-rep so rectangular/circular/path/mirror/geometric patterns can copy
  // its actual delta.
  const command = store.slice(store.indexOf("} else if (d.kind === 'pattern')"), store.indexOf("} else if (d.kind === 'circpattern')", store.indexOf("} else if (d.kind === 'pattern')")))
  assert.match(command, /const _live = selFs\.filter\(\(fid2\) => get\(\)\.features\.some\(\(x\) => x\.id === fid2\)\)/)
  assert.match(command, /ptTargets = _live/)
  assert.doesNotMatch(command, /\.type === ['\"]extrude['\"]/)
  const setup = worker.slice(worker.indexOf("const TARGETED = new Set"), worker.indexOf("const sigs = features.map"))
  assert.match(setup, /const cpTargets = new Set<string>\(\)/)
  assert.match(setup, /if \(TARGETED\.has\(f\.type\) && t\) for \(const x of t\) cpTargets\.add\(x\)/)
  assert.match(setup, /const snap = cpSnap\[tid\]/)
  assert.match(setup, /const tf = features\.find\(\(x\) => x\.id === tid\)/)
  const replay = worker.slice(worker.indexOf('const _cpT = cpTargets.has'), worker.indexOf("if (f.type === 'extrude')", worker.indexOf('const _cpT = cpTargets.has')))
  assert.match(replay, /const _cpT = cpTargets\.has\(f\.id\)/)
  assert.match(replay, /const _cpB = _cpT && shape \? shape\.clone\(\) : null/)
})

test('startup blocks input until shared/autosave hydration has completed', () => {
  assert.match(app, /const \[startupReady, setStartupReady\] = useState\(false\)/)
  assert.match(app, /const shared = await useApp\.getState\(\)\.loadShareHash\(\)\s+if \(!shared\) await useApp\.getState\(\)\.restoreAutosave\(\)/)
  assert.match(app, /if \(!startupReady\) return\s+const t = e\.target/)
  assert.match(app, /startup-restore-gate/)
  assert.match(styles, /\.startup-restore-gate \{[\s\S]*?z-index: 50000;[\s\S]*?pointer-events: auto;/)
})

test('whole-kernel rebuild failures retain the previous model and flag a recoverable suspected feature', () => {
  const rebuild = store.slice(store.indexOf('applyFeatures: async'), store.indexOf('  undo: async', store.indexOf('applyFeatures: async')))
  assert.match(rebuild, /已保持上一个有效状态/)
  assert.match(rebuild, /const suspect = \[\.\.\.bound\]\.reverse\(\)\.find\(\(f\) => !sup\.includes\(f\.id\)\)/)
  assert.match(rebuild, /疑似此特征；可改参数或抑制后重试/)
  assert.match(rebuild, /failedFeatureIds: suspect \? \[suspect\.id\] : \[\]/)
  assert.match(rebuild, /featureErrors: suspect \? \{ \[suspect\.id\]: reason \} : \{\}/)
})
