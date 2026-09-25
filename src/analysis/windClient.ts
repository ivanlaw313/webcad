// 风洞趋势 worker 客户端 — 懒创建独立 worker（首次运行先开），失败直接报错唔静默。
// （结构同 moldClient.ts / feaClient.ts 一致：comlink wrap 单例 + onProgress proxy。）
import { wrap, proxy, type Remote } from 'comlink'
import type { WindInput, WindResult } from './windtunnel'

type WindAPI = { run(inp: Omit<WindInput, 'onProgress'>, onProgress?: (pct: number, note: string) => void): WindResult }

let api: Remote<WindAPI> | null = null
let worker: Worker | null = null
let rejectPending: ((e: Error) => void) | null = null

/** wind-fix：取消时 reject 嘅错误（store 靠 name 分辨「用户取消」同真错误）。 */
export class WindCancelledError extends Error {
  constructor() { super('風洞計算已取消'); this.name = 'WindCancelledError' }
}

/** 喺独立 worker 入面跑风洞/水洞趋势模拟；inp.onProgress 经 comlink proxy 回传主线程。 */
export async function runWind(inp: WindInput): Promise<WindResult> {
  if (!api) {
    worker = new Worker(new URL('../worker/wind.worker.ts', import.meta.url), { type: 'module', name: 'wind' })
    api = wrap<WindAPI>(worker)
  }
  const { onProgress, ...rest } = inp
  const call = api.run(rest, onProgress ? proxy(onProgress) : undefined)
  // wind-fix：LBM 系 worker 入面嘅同步长循环，唔会睇 message → 取消只可以 terminate worker。
  //   terminate 之后 comlink 个 promise 永远唔返，所以要自己 race 一个可 reject 嘅 promise。
  const cancelled = new Promise<never>((_, reject) => { rejectPending = reject })
  try {
    return await Promise.race([call, cancelled])
  } finally {
    rejectPending = null
  }
}

/** wind-fix：中止进行中嘅 CPU 风洞计算（terminate worker；下次 runWind 会重开一个）。返回是否真系有嘢取消。 */
export function cancelWindRun(): boolean {
  const had = !!rejectPending
  if (worker) { worker.terminate(); worker = null; api = null }
  if (rejectPending) { const r = rejectPending; rejectPending = null; r(new WindCancelledError()) }
  return had
}
