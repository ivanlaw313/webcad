// wind-fix 回归（store 级）：风洞 busy 状态一定放得返 + Esc 唔会静静鸡删结果 + GPU 唔会自动开跑。
//   bug：GPU 取消后面板永远「计算中…」（windBusy 冇放）；切 CPU / 重开都冇用，净系 reload 救到。
//   bug：Esc 一撳就清走跑咗 205 秒嘅结果（「已清除风洞分析」），冇确认。
//   bug：拣 GPU 即刻开跑（唔使撳运行）。
// 做法同 shell-preview-lifecycle.test.mjs：由 src/store.ts 真源码切出风洞 actions，喺 vm 入面用最细 stub 跑
//   （成个 store 喺 node import 要 OCCT/planegcs）。windClient.ts 用真模块 + 真 comlink，Worker 换成永远唔覆嘅假 worker。
// 跑法：node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/wind-busy-cancel.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'

const workers = []
globalThis.Worker = class FakeWorker {
  constructor() { this.terminated = false; workers.push(this) }
  addEventListener() {}
  removeEventListener() {}
  postMessage() { /* 永远唔覆 = LBM 喺 worker 入面跑紧几分钟 */ }
  start() {}
  terminate() { this.terminated = true }
}
// comlink 嘅 proxy(onProgress) 会开 MessageChannel；node 入面 port 会吊住 event loop → 测试唔收工。unref 佢哋。
const RealMC = globalThis.MessageChannel
globalThis.MessageChannel = class extends RealMC {
  constructor() {
    super()
    for (const p of [this.port1, this.port2]) { const s = p.start.bind(p); p.start = () => { s(); p.unref?.() } }
  }
}
const windClient = await import('../src/analysis/windClient.ts')

function harness() {
  const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const a = source.indexOf('  toggleWind: () => set((s) => {')
  const b = source.indexOf('  downloadWindReport: () => {', a)
  assert.ok(a > 0 && b > a, 'wind actions slice not found in store.ts')
  const actions = source.slice(a, b).replaceAll("import('./analysis/windClient')", '__importWindClient()')
  let state
  const set = (p) => { state = { ...state, ...(typeof p === 'function' ? p(state) : p) } }
  const ctx = vm.createContext({
    get: () => state, set, windRunSeq: 0,
    moldTargetMesh: (s) => (s.bodyMesh ? { vertices: s.bodyMesh.vertices, triangles: s.bodyMesh.triangles } : null),
    __importWindClient: () => Promise.resolve(windClient),
    Date, Math, Float32Array, Uint32Array, Error, String, Promise,
  })
  const api = vm.runInContext(stripTypeScriptTypes(`({${actions}})`), ctx)
  state = {
    ...api, windMode: 1, windBusy: false, windProg: 0, windProgNote: '', windResult: null, windReport: '',
    windEngine: 'cpu', windGpuRunId: 0, windSpeed: 20, windFluid: 'air', windAxis: null, windSign: 1, windRes: 12,
    lowPower: false, status: '', projectName: 't',
    bodyMesh: { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2] },
  }
  return { g: () => state, ctx }
}
const tick = () => new Promise((r) => setTimeout(r, 20))
const fakeResult = { cd: 1.2, cdCorr: 1.0, dragN: 0.5, dragNRaw: 0.6 }

test('CPU run: cancel resets busy immediately, terminates the worker, late rejection does not overwrite state', async () => {
  const { g } = harness()
  const p = g().runWindSolve()
  await tick()
  assert.equal(g().windBusy, true, 'run should be in flight')
  const w = workers.at(-1)
  g().requestClearWind()                       // Esc / ✕ / 取消 while busy = cancel
  assert.equal(g().windBusy, false, 'busy must be released by cancel')
  await Promise.race([p, new Promise((_, rj) => setTimeout(() => rj(new Error('runWindSolve hung after cancel')), 2000))])
  assert.equal(g().windBusy, false)
  assert.equal(w.terminated, true, 'LBM worker must be terminated')
  assert.match(g().status, /已取消/)
  // 之后可以即刻再跑（旧版会报「风洞计算紧 — 等佢完成」）
  const n = workers.length
  const p2 = g().runWindSolve(); await tick()
  assert.equal(g().windBusy, true)
  assert.equal(workers.length, n + 1, 'a fresh worker is created after cancel')
  g().cancelWind(); await p2
  assert.equal(g().windBusy, false)
})

test('CPU run: a worker error still releases busy (finally)', async () => {
  const { g, ctx } = harness()
  ctx.__importWindClient = () => Promise.resolve({ runWind: () => Promise.reject(new Error('boom')) })
  await g().runWindSolve()
  assert.equal(g().windBusy, false)
  assert.match(g().status, /boom/)
})

test('GPU: selecting the engine does not start a run; Run bumps the request id; cancel resets busy + id', () => {
  const { g } = harness()
  g().setWindOpt({ windEngine: 'gpu' })
  assert.equal(g().windGpuRunId, 0, 'selecting GPU must not request a run')
  assert.equal(g().windBusy, false)
  void g().runWindSolve()
  assert.equal(g().windGpuRunId, 1, 'Run requests a GPU run')
  assert.equal(g().windMode, 1, 'panel stays active so the GPU driver is not paused')
  harnessSet(g, { windBusy: true })            // WindTunnelGpu sets windBusy when it builds the solver
  g().requestClearWind()                       // user cancels (Esc / ✕ / 取消)
  assert.equal(g().windBusy, false)
  assert.equal(g().windGpuRunId, 0, 'cancel withdraws the run request (driver disposes the solver)')
  // switching engines also withdraws a stale request (otherwise switching back would auto-start)
  void g().runWindSolve(); assert.equal(g().windGpuRunId, 1)
  g().setWindOpt({ windEngine: 'cpu' }); assert.equal(g().windGpuRunId, 0)
  g().setWindOpt({ windEngine: 'gpu' }); assert.equal(g().windGpuRunId, 0)
})

test('Esc/cancel with a completed result keeps it unless confirmed; explicit Clear removes it', () => {
  const { g, ctx } = harness()
  harnessSet(g, { windResult: fakeResult, windReport: 'r' })
  g().requestClearWind()                       // 冇 window.confirm → 当「唔确认」
  assert.equal(g().windResult, fakeResult, 'Esc must not discard a completed result')
  assert.match(g().status, /保留/)
  ctx.window = { confirm: () => false }
  g().requestClearWind()
  assert.equal(g().windResult, fakeResult, 'declined confirm keeps the result')
  ctx.window.confirm = () => true
  g().requestClearWind()
  assert.equal(g().windResult, null, 'confirmed clear removes it')
  delete ctx.window
  harnessSet(g, { windResult: fakeResult })
  g().clearWind()                              // 面板「🗑 清除结果」按钮
  assert.equal(g().windResult, null)
})

// 用 action 自己个 setWindOpt（= set(p)）写 state，唔另开后门
function harnessSet(g, patch) { g().setWindOpt(patch) }
