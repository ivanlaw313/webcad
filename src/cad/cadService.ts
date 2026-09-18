// OCCT worker 自愈代理（self-healing proxy）。
// 旧版只係一句 Comlink wrap：wasm 一 abort（OOM / unreachable trap）成个几何端就死咗，只能刷新页面。
// 而家每个调用都经 watchdog 包装：超时 / worker error / 疑似 wasm 崩溃嘅 rejection → 自动 terminate +
// 重开新 worker + 重放「最后一次成功 rebuild 嘅特征树」快照，令内核状态追返 UI。调用方零改动。
import { wrap } from 'comlink'
import type { Remote } from 'comlink'
import type { CadAPI, Feature } from '../worker/cad.worker'

// 在飞调用被内核重启打断时收到嘅错误文案（store 直接展示俾用户）
export const KERNEL_RESTART_MSG = '内核已重启（上次操作令几何内核崩溃）— 模型已恢复到上一个成功状态，请简化嗰步操作再试'

const DEFAULT_TIMEOUT = 60_000
const LONG_TIMEOUT = 120_000
// 重活允许 120s：rebuild（全量重放特征树，首次仲包埋 wasm 加载）/ importStep（STEP 解析）/
// splitBuild（内部 rebuild 两次）/ ready（慢网络下 wasm 下载+编译）/
// previewRound（shell/fillet 预览 = 同 rebuild 同款 buildShape；v1.28–v1.31 shell ladder 喺 wasm 可慢）
const LONG_METHODS = new Set([
  'rebuild', 'importStep', 'splitBuild', 'ready',
  'exportAssemblySTEP', 'importStepAssembly', 'projectAssemblyViews',
  'previewRound',
])

// 一个 rejection 似唔似 wasm 内核崩溃（Emscripten "Aborted(...)" / "unreachable executed" / 内存爆）
// v1.32: 收紧匹配 — 单字 "abort"/"memory" 太易误伤业务错误（例如 AbortController / "out of memory hint"），
// 只认 Emscripten 经典崩溃文案，避免 catchable 业务 throw 触发无谓 worker 重启 toast。
export function looksLikeKernelCrash(reason: unknown): boolean {
  const m = String((reason as { message?: unknown } | null)?.message ?? reason ?? '').toLowerCase()
  if (!m) return false
  // 自愈文案本身唔好再当崩溃（防连环）
  if (m.includes('内核已重启') || m.includes('kernel restart')) return false
  return (
    /\baborted\s*\(/.test(m) ||
    m.includes('unreachable executed') ||
    m.includes('out of memory') ||
    m.includes('memory access out of bounds') ||
    (m.includes('runtimeerror') && (m.includes('abort') || m.includes('memory')))
  )
}

// 最小 worker 抽象 —— 真实现 = Worker + Comlink wrap；node 测试注入 mock
export type RawKernel = {
  api: Record<string, (...args: unknown[]) => Promise<unknown>>
  terminate: () => void
  onError: (cb: () => void) => void
}
export type KernelOpts = { defaultTimeout?: number; longTimeout?: number }

// promise 加超时（重放快照时用，唔入 pending 登记，免得自己触发重启循环）
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('replay timeout')), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

// watchdog 核心（可测试：spawnRaw 注入 mock worker，超时缩短）。
// 返回 { proxy, onKernelRestart, getState }；proxy 上任意方法名都委托去当前 worker 嘅同名方法。
export function createKernelProxy(spawnRaw: () => RawKernel, opts: KernelOpts = {}) {
  const defT = opts.defaultTimeout ?? DEFAULT_TIMEOUT
  const longT = opts.longTimeout ?? LONG_TIMEOUT

  type Pending = { reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  let raw: RawKernel
  let generation = 0                              // 第几代 worker（每次 spawn +1）
  let restarting = false                          // 重启进行中（防重入）
  let recovering: Promise<void> | null = null     // 重放快照中 —— 新调用要等佢完先发出
  let lastGoodFeatures: Feature[] | null = null   // 最后一次成功 rebuild 嘅特征树（深拷贝）
  let restartCount = 0                            // 测试/诊断：累计重启次数
  const pending = new Set<Pending>()
  const restartCbs: ((msg: string) => void)[] = []
  const notify = (msg: string) => { for (const cb of restartCbs.slice()) { try { cb(msg) } catch { /* UI 回调唔好炸代理 */ } } }
  const sc = (globalThis as { structuredClone?: <T>(v: T) => T }).structuredClone
  const deepCopy = <T,>(v: T): T => (sc ? sc(v) : JSON.parse(JSON.stringify(v)))

  // v1.32: 单飞队列 —— 同一时间只跑一个内核调用。Timeout 只从【真正拿到执行权】起计，
  // 唔再从「入队时刻」起计。否则 shell/fillet 连续 previewRound 会叠计时：后一个喺队列里
  // 等前一个时已烧晒 60s → 伪超时 → terminate + 「内核已重启」toast（BX01/BX02 @v1.31 实证）。
  let gate: Promise<void> = Promise.resolve()

  function spawn() {
    generation++
    const myGen = generation
    raw = spawnRaw()
    // 旧代 worker 迟到嘅 error 事件唔好误杀新内核（generation 守卫）
    raw.onError(() => { if (myGen === generation) restart('worker error 事件') })
  }
  spawn()

  function restart(why: string) {
    if (restarting) return
    restarting = true
    restartCount++
    // 1) 杀死旧 worker，开新一个
    try { raw.terminate() } catch { /* 已死 */ }
    // 2) 在飞调用全部拒绝（结果已不可信）
    const err = new Error(KERNEL_RESTART_MSG)
    for (const p of pending) { clearTimeout(p.timer); try { p.reject(err) } catch { /* 已 settle */ } }
    pending.clear()
    spawn()
    notify(`⚠ 几何内核崩溃（${why}），已自动重启，正在恢复上一个成功状态…`)
    // 3) 重放快照令新内核状态追返 UI；后续调用会先 await recovering 再发出
    recovering = (async () => {
      const snap = lastGoodFeatures
      if (!snap) { notify('内核已重启（无可恢复嘅模型状态）'); return }
      try {
        await withTimeout(raw.api.rebuild(deepCopy(snap)), longT)
        notify('内核已重启 — 模型已恢复到上一个成功状态')
      } catch {
        // 重放本身都令内核死 → 弃快照、再开个干净内核（防无限重启循环）
        lastGoodFeatures = null
        try { raw.terminate() } catch { /* 已死 */ }
        spawn()
        notify('⚠ 内核重启后恢复失败 — 已重置为空内核，请撤销最后一步操作再重建')
      }
    })().finally(() => { recovering = null; restarting = false })
  }

  const cache = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  function instrument(method: string) {
    return async (...args: unknown[]) => {
      // 排队：等前一个调用结束（或被重启拒绝）先拿执行权，然后先等 recovering，再开 timeout。
      let release!: () => void
      const myTurn = new Promise<void>((r) => { release = r })
      const prev = gate
      gate = myTurn
      try {
        await prev.catch(() => {})   // 前任失败/拒绝唔好卡住整条队列
        if (recovering) await recovering
        const timeoutMs = LONG_METHODS.has(method) ? longT : defT
        return await new Promise<unknown>((resolve, reject) => {
          const entry: Pending = {
            reject,
            timer: setTimeout(() => { if (pending.has(entry)) restart(`${method} 超时（${Math.round(timeoutMs / 1000)}s 无响应）`) }, timeoutMs),
          }
          pending.add(entry)
          const settle = () => { clearTimeout(entry.timer); pending.delete(entry) }
          Promise.resolve()
            // 发出前已被重启拒绝 → 唔好打搅新内核（resolve undefined，下面 pending 检查会弃掉）
            .then(() => (pending.has(entry) ? raw.api[method](...args) : undefined))
            .then(
              (res) => {
                if (!pending.has(entry)) return       // 已被重启拒绝 → 弃掉迟到结果
                settle()
                if (method === 'rebuild') {
                  // 快照：rebuild 成功出到 mesh（或合法嘅空特征树 → null）就深拷贝特征做恢复用。
                  // 非空特征树而结果 null = worker 内部 build 失败 —— 唔好用佢覆盖上一个好状态。
                  const feats = args[0] as Feature[] | undefined
                  if (res !== null || !feats || feats.length === 0) lastGoodFeatures = deepCopy(feats ?? [])
                }
                resolve(res)
              },
              (e) => {
                if (!pending.has(entry)) return       // 已被重启拒绝
                settle()
                if (looksLikeKernelCrash(e)) { restart(`${method} 抛出疑似内核崩溃错误`); reject(new Error(KERNEL_RESTART_MSG)) }
                else reject(e as Error)               // 普通业务错误原样透传
              },
            )
        })
      } finally {
        release()
      }
    }
  }

  // Comlink proxy 唔可以枚举方法 → 用 Proxy({},{get}) 对任意方法名即时生成 watchdog 包装（带缓存）
  const proxy = new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      if (typeof prop !== 'string' || prop === 'then') return undefined   // 防止被当 thenable
      let fn = cache.get(prop)
      if (!fn) { fn = instrument(prop); cache.set(prop, fn) }
      return fn
    },
  })

  function onKernelRestart(cb: (msg: string) => void): () => void {
    restartCbs.push(cb)
    return () => { const i = restartCbs.indexOf(cb); if (i >= 0) restartCbs.splice(i, 1) }
  }

  // 测试钩子（生产代码唔好依赖）
  const getState = () => ({ generation, recovering: !!recovering, hasSnapshot: !!lastGoodFeatures, restartCount })

  return { proxy, onKernelRestart, getState }
}

// ---- 真·worker 实例（浏览器） ----
function realSpawn(): RawKernel {
  const w = new Worker(new URL('../worker/cad.worker.ts', import.meta.url), {
    type: 'module',
    name: 'cad-kernel',
  })
  return {
    api: wrap<CadAPI>(w) as unknown as RawKernel['api'],
    terminate: () => w.terminate(),
    onError: (cb) => { w.addEventListener('error', cb); w.addEventListener('messageerror', cb) },
  }
}

// node / SSR 环境冇 Worker → 唔好喺 import 时炸（node 测试只用 createKernelProxy）；浏览器一定有
const kernel = typeof Worker !== 'undefined' ? createKernelProxy(realSpawn) : null

export const cad = (kernel ? kernel.proxy : ({} as unknown)) as Remote<CadAPI>

// DEV：暴露内核句柄到 window 供控制台验证（window.cad.rebuild / getControlNet）。生产关闭 → 无副作用。
if (typeof window !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV) (window as { cad?: unknown }).cad = cad

// UI 订阅内核重启状态（integration：store 可以 onKernelRestart((msg) => set({ status: msg }))）
export function onKernelRestart(cb: (msg: string) => void): () => void {
  return kernel ? kernel.onKernelRestart(cb) : () => {}
}
