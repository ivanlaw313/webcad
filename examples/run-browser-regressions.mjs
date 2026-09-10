#!/usr/bin/env node
// Separate Playwright launches use fresh temporary profiles; never attach to user tabs.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { runWorkflowProcess } from './workflow-process.mjs'
import { createHash } from 'node:crypto'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workflows = {
  shellMultiCut: ['verify-shell-multi-cut.mjs', 'browser-validation.json'],
  fileMenu: ['verify-file-menu.mjs', 'browser-validation.json'],
  legacyArray: ['verify-legacy-array.mjs','browser-validation.json'],
  sketchArray: ['verify-sketch-array.mjs','browser-validation.json'],
  interactiveScale: ['verify-interactive-scale.mjs','browser-validation.json'],
  gridFar: ['verify-far-grid.mjs','browser-validation.json'],
  sketchScale: ['verify-sketch-scale.mjs','browser-validation.json'],
  farOrigin: ['verify-far-origin-workflow.mjs','browser-validation.json'],
  moveSemantics: ['verify-move-semantics.mjs','browser-validation.json'],
  rotatedConstrainedCopy: ['verify-rotated-constrained-copy.mjs','browser-validation.json'],
  constrainedCopy: ['verify-constrained-copy.mjs','browser-validation.json'],
  ellipseArcInteriorTangent: ['verify-ellipse-arc-interior-tangent.mjs','browser-validation.json'],
  ellipseGeneralTangent: ['verify-ellipse-general-tangent.mjs','browser-validation.json'],
  ellipseTangent: ['verify-ellipse-tangent.mjs','browser-validation.json'],
  ellipticSelection: ['verify-elliptic-selection.mjs', 'browser-validation.json'],
  ellipseArc: ['verify-ellipse-arc.mjs', 'browser-validation.json'],
  liveReadout: ['verify-live-readout.mjs', 'browser-validation.json'],
  threePointEllipse: ['verify-three-point-ellipse.mjs', 'browser-validation.json'],
  ellipse: ['verify-ellipse-workflow.mjs', 'browser-validation.json'],
  splineMirror: ['verify-spline-mirror.mjs', 'browser-validation.json'],
  mirror: ['verify-sketch-mirror.mjs', 'browser-validation.json'],
  copy: ['verify-sketch-copy.mjs', 'browser-validation.json'],
  labels: ['verify-label-selection.mjs', 'browser-validation.json'],
  overlay: ['verify-drag-overlay.mjs', 'browser-validation.json'],
  edge: ['verify-edge-drag.mjs', 'browser-validation.json'],
  indirect: ['verify-indirect-drag.mjs', 'browser-validation.json'],
  constrained: ['verify-constrained-drag.mjs', 'browser-validation.json'],
  center: ['verify-trim-center-workflow.mjs', 'browser-validation.json'],
  relink: ['verify-projection-relink.mjs', 'browser-validation.json'],
  revolve: ['verify-face-revolve-workflow.mjs', 'browser-validation.json'],
  trim: ['verify-trim-constraint-workflow.mjs', 'browser-validation.json'],
  extend: ['verify-extend-workflow.mjs', 'browser-validation.json'],
  region: ['verify-region-rebuild-workflow.mjs', 'browser-validation.json'],
  dimension: ['verify-sketch-dimension-transaction.mjs', 'WebCAD-phase7-browser-validation.json'],
  arc: ['verify-arc-drag-workflow.mjs', 'browser-validation.json'],
  face: ['verify-face-sketch-binding.mjs', 'browser-validation.json'],
  projection: ['verify-projection-refresh.mjs', 'WebCAD-phase8-browser-validation.json'],
  drag: ['verify-sketch-drag.mjs', 'WebCAD-phase4-browser-validation.json'],
  mixed: ['verify-mixed-workflow.mjs', 'WebCAD-phase5-mixed-browser-validation.json'],
  display: ['verify-escape-display-workflow.mjs', 'WebCAD-phase6-browser-validation.json'],
  form: ['verify-form-workflow.mjs', 'WebCAD-phase5-browser-validation.json'],
}
const groups = { smoke: ['dimension', 'projection', 'arc'], sketch: ['dimension', 'projection', 'drag', 'arc', 'face', 'region', 'extend', 'trim', 'revolve', 'relink', 'center', 'constrained', 'indirect', 'edge', 'overlay', 'labels', 'copy', 'mirror', 'splineMirror', 'ellipse', 'threePointEllipse', 'liveReadout', 'ellipseArc', 'ellipticSelection', 'ellipseTangent', 'ellipseGeneralTangent', 'ellipseArcInteriorTangent', 'constrainedCopy', 'rotatedConstrainedCopy', 'moveSemantics', 'farOrigin', 'sketchScale', 'gridFar', 'interactiveScale', 'sketchArray', 'legacyArray'], model: ['mixed'], ui: ['display'], form: ['form'], all: Object.keys(workflows) }
let concurrency = 3, group = 'smoke', headed = process.env.WEBCAD_TEST_HEADED === '1', dryRun = false, timeoutMs = 180000
let url = process.env.WEBCAD_TEST_URL || 'http://127.0.0.1:4173/?ui-test=1'
for (const arg of process.argv.slice(2)) {
  if (arg === '--headed') headed = true
  else if (arg === '--dry-run') dryRun = true
  else if (arg.startsWith('--groups=')) group = arg.slice(9)
  else if (arg.startsWith('--concurrency=')) concurrency = Number(arg.slice(14))
  else if (arg.startsWith('--timeout-ms=')) timeoutMs = Number(arg.slice(13))
  else if (arg.startsWith('--url=')) url = arg.slice(6)
  else throw new Error(`Unknown argument: ${arg}`)
}
if (![1, 2, 3].includes(concurrency)) throw new Error('Concurrency must be 1, 2, or 3 (three independent Chrome sessions maximum).')
if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000) throw new Error('Timeout must be an integer >= 1000 ms.')
const names = [...new Set(group.split(',').flatMap(g => {
  if (groups[g]) return groups[g]
  if (workflows[g]) return [g]
  throw new Error(`Unknown group/workflow: ${g}`)
}))]
const plan = { concurrency, headed, url, timeoutMs, workflows: names.map(name => ({ name, script: workflows[name][0] })) }
if (dryRun) { console.log(JSON.stringify(plan, null, 2)); process.exit(0) }
const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
if (!response.ok) throw new Error(`Preview unavailable: HTTP ${response.status}; build/start preview before running.`)
const outputs = path.resolve(process.env.WEBCAD_BROWSER_RUNS_DIR || path.join(repo, '../../outputs/browser-runs'))
await fs.mkdir(outputs, { recursive: true })
const runDir = await fs.mkdtemp(path.join(outputs, new Date().toISOString().replaceAll(':', '-') + '-'))
const started = performance.now(), results = []
const controller = new AbortController()
let interrupted = false
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  interrupted = true
  controller.abort()
})
const metadata = { ...plan, startedAt: new Date().toISOString(), runDir, node: process.version,
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  dirtyStatus: execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }),
  servedIndexSha256: createHash('sha256').update(await response.text()).digest('hex') }
await fs.writeFile(path.join(runDir, 'plan.json'), JSON.stringify(metadata, null, 2))
console.log(`Evidence: ${runDir}`)
async function run(name) {
  const [script, validation] = workflows[name], out = path.join(runDir, name)
  const begin = performance.now()
  let log, result = { name, status: 'FAIL', outputDirectory: out, checks: 0 }
  try {
    await fs.mkdir(out)
    log = await fs.open(path.join(out, 'process.log'), 'wx')
    result.scriptSha256 = createHash('sha256').update(await fs.readFile(path.join(repo, 'examples', script))).digest('hex')
    const outcome = await runWorkflowProcess({
      args: [path.join(repo, 'examples', script)], cwd: repo, logFd: log.fd, timeoutMs, signal: controller.signal,
      env: { ...process.env, WEBCAD_TEST_URL: url, WEBCAD_TEST_OUTPUT_DIR: out, WEBCAD_TEST_HEADED: headed ? '1' : '0' },
    })
    Object.assign(result, outcome)
    const evidence = JSON.parse(await fs.readFile(path.join(out, validation), 'utf8'))
    result.checks = evidence?.checks?.length ?? 0
    result.status = outcome.code === 0 && !outcome.timedOut && !outcome.cleanupErrors.length && evidence?.status === 'PASS' ? 'PASS' : 'FAIL'
  } catch (error) { result.error = error.message }
  finally {
    try { await log?.close() } catch (error) { result.error = error.message; result.status = 'FAIL' }
    result.elapsedMs = Math.round(performance.now() - begin)
    results.push(result)
    console.log(`${name}: ${result.status} (${result.elapsedMs} ms, ${result.checks} checks)`)
  }
}
let next = 0
await Promise.all(Array.from({ length: Math.min(concurrency, names.length) }, async () => {
  while (!interrupted && next < names.length) await run(names[next++])
}))
const summary = { ...metadata, status: !interrupted && results.length === names.length && results.every(r => r.status === 'PASS') ? 'PASS' : 'FAIL',
  elapsedMs: Math.round(performance.now() - started), interrupted,
  results: names.map(name => results.find(r => r.name === name) || { name, status: 'NOT_RUN' }) }
await fs.writeFile(path.join(runDir, 'summary.json'), JSON.stringify(summary, null, 2))
console.log(`Overall: ${summary.status}; ${summary.elapsedMs} ms`)
process.exitCode = summary.status === 'PASS' ? 0 : 1
