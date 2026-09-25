// AI Copilot aero_* tools: schema pattern + dispatch (no LLM, no browser).
// Run: node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/aero-copilot-tools.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TOOL_DEFS, AI_SYSTEM_PROMPT } from '../src/ai/tools.ts'
import { runAeroTool, AERO_TOOL_NAMES } from '../src/aero/aeroTools.ts'
import { specFromBriefFallback } from '../src/aero/brief.ts'
import { templateOf } from '../src/aero/templates.ts'
import { newLoopState, driveLoop } from '../src/aero/autoLoop.ts'
import { runAeroOptimization } from '../src/aero/optimize/runner.ts'

function fakeDeps({ health = { ok: false, running: [], queued: [] } } = {}) {
  const calls = { open: [], start: [], stop: 0, brief: [] }
  let loop = null
  let lab = null
  const deps = {
    specFromBrief: async (b) => { calls.brief.push(b); return { spec: specFromBriefFallback(b), usedAi: false, note: 'no key' } },
    templateSpec: (k) => templateOf(k),
    currentSpec: () => lab,
    openLab: (spec, brief) => { calls.open.push({ spec, brief }); if (spec) lab = spec },
    startLoop: async (spec, cfg) => {
      calls.start.push({ spec, cfg })
      let clock = 5e6
      loop = newLoopState(spec, { ...cfg, budget: 120 }, clock)
      await driveLoop(loop, {
        optimize: async (s, o) => runAeroOptimization(s, { ...o, budget: 120 }),
        cfd: { health: async () => health, submit: async () => { throw new Error('offline') }, status: async () => ({}), result: async () => ({}), cancel: async () => {} },
        now: () => clock, sleep: async (ms) => { clock += ms },
      })
      return loop
    },
    getLoop: () => loop,
    stopLoop: () => { calls.stop++; if (loop) loop.cancelRequested = true },
  }
  return { deps, calls, setLoop: (l) => { loop = l } }
}

test('tool schema: aero_* defs follow the TOOL_DEFS pattern and all have a dispatcher', async () => {
  const aero = TOOL_DEFS.filter((d) => d.name.startsWith('aero_'))
  assert.deepEqual(aero.map((d) => d.name).sort(), [...AERO_TOOL_NAMES].sort())
  for (const d of TOOL_DEFS) {
    assert.equal(typeof d.description, 'string'); assert.ok(d.description.length > 3, d.name)
    assert.equal(d.parameters.type, 'object'); assert.equal(typeof d.parameters.properties, 'object')
    for (const r of d.parameters.required ?? []) assert.ok(r in d.parameters.properties, `${d.name}.${r}`)
    for (const [k, p] of Object.entries(d.parameters.properties)) assert.ok(['string', 'number', 'boolean'].includes(p.type), `${d.name}.${k}`)
  }
  assert.equal(new Set(TOOL_DEFS.map((d) => d.name)).size, TOOL_DEFS.length, 'unique tool names')
  const { deps } = fakeDeps()
  for (const n of AERO_TOOL_NAMES) assert.notEqual(await runAeroTool(n, {}, deps), null, n)
  assert.equal(await runAeroTool('create_box', {}, deps), null, 'non-aero tools fall through')
  assert.match(AI_SYSTEM_PROMPT, /aero_start_auto_design/)
  // store.aiTool delegates aero_* lazily
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(store, /name\.startsWith\('aero_'\)[\s\S]{0,200}import\('\.\/aero\/aeroCopilot'\)/)
})

test('aero_open_lab: brief → design space pushed to the lab; kind → template', async () => {
  const { deps, calls } = fakeDeps()
  const out = await runAeroTool('aero_open_lab', { brief: '水底推進器外殼 最低水阻' }, deps)
  assert.match(out, /^✓/)
  assert.equal(calls.brief[0], '水底推進器外殼 最低水阻')
  assert.equal(calls.open[0].spec.kind, 'shell'); assert.equal(calls.open[0].brief, '水底推進器外殼 最低水阻')
  assert.equal(JSON.parse(out.split('\n')[1]).kind, 'shell')
  await runAeroTool('aero_open_lab', { kind: 'wing' }, deps)
  assert.equal(calls.open[1].spec.kind, 'wing')
  const bare = await runAeroTool('aero_open_lab', {}, fakeDeps().deps)
  assert.match(bare, /^✓/)
})

test('aero_start_auto_design: args clamped/mapped, loop started, status reports best', async () => {
  const { deps, calls } = fakeDeps()
  assert.match(await runAeroTool('aero_start_auto_design', {}, deps), /^✗ 需要 brief/)
  const out = await runAeroTool('aero_start_auto_design', { kind: 'shell', rounds: 99, top_n: 0, max_cfd_jobs: 4, max_minutes: 1, mesh: 'coarse', epsilon: 'x' }, deps)
  assert.match(out, /^✓ 已開始自動設計/)
  assert.match(out, /只用工程估算/, 'offline → estimator-only stated')
  const cfg = calls.start[0].cfg
  assert.deepEqual(cfg, { rounds: 10, topN: 1, maxJobs: 4, maxMinutes: 5, mesh: 'coarse' })
  assert.equal(calls.open[0].spec.kind, 'shell', 'lab opened with the same design space')
  const status = await runAeroTool('aero_auto_design_status', {}, deps)
  const js = JSON.parse(status.split('\n')[1])
  assert.equal(js.template, 'shell'); assert.equal(js.mode, 'estimator'); assert.equal(js.best.verifiedByCfd, false)
  assert.ok(Object.keys(js.best.params).length === 6 && js.perRound.length >= 1, JSON.stringify(js.best))
  assert.match(status, /未經 CFD 驗證/)
})

test('aero_start_auto_design: prop defaults to estimator-only, rotor CFD opt-in is passed through', async () => {
  let f = fakeDeps({ health: { ok: true, running: [], queued: [] } })
  let out = await runAeroTool('aero_start_auto_design', { kind: 'prop', rounds: 1 }, f.deps)
  assert.match(out, /use_rotor_cfd=true/)
  assert.equal(f.calls.start[0].cfg.useRotorCfd, undefined)
  f = fakeDeps({ health: { ok: true, running: [], queued: [] } })
  out = await runAeroTool('aero_start_auto_design', { kind: 'prop', rounds: 1, use_rotor_cfd: true }, f.deps)
  assert.equal(f.calls.start[0].cfg.useRotorCfd, true)
  assert.match(out, /轉子 CFD 未經驗證/)
})

test('aero_* guards: second start while running, stop, status with no loop', async () => {
  const f = fakeDeps()
  assert.match(await runAeroTool('aero_auto_design_status', {}, f.deps), /^✗ 未有/)
  assert.match(await runAeroTool('aero_stop_auto_design', {}, f.deps), /^✗/)
  const running = newLoopState(templateOf('shell'), {}, 1)
  f.setLoop(running)
  assert.match(await runAeroTool('aero_start_auto_design', { kind: 'shell' }, f.deps), /^✗ 已經有/)
  assert.equal(f.calls.start.length, 0)
  assert.match(await runAeroTool('aero_auto_design_status', {}, f.deps), /^⏳ 運行緊/)
  assert.match(await runAeroTool('aero_stop_auto_design', {}, f.deps), /^✓/)
  assert.equal(f.calls.stop, 1); assert.equal(running.cancelRequested, true)
})
