// 风洞趋势 worker 客户端 — 懒创建独立 worker（首次运行先开），失败直接报错唔静默。
// （结构同 moldClient.ts / feaClient.ts 一致：comlink wrap 单例 + onProgress proxy。）
import { wrap, proxy, type Remote } from 'comlink'
import type { WindInput, WindResult } from './windtunnel'

type WindAPI = { run(inp: Omit<WindInput, 'onProgress'>, onProgress?: (pct: number, note: string) => void): WindResult }

let api: Remote<WindAPI> | null = null

/** 喺独立 worker 入面跑风洞/水洞趋势模拟；inp.onProgress 经 comlink proxy 回传主线程。 */
export async function runWind(inp: WindInput): Promise<WindResult> {
  if (!api) {
    const w = new Worker(new URL('../worker/wind.worker.ts', import.meta.url), { type: 'module', name: 'wind' })
    api = wrap<WindAPI>(w)
  }
  const { onProgress, ...rest } = inp
  return api.run(rest, onProgress ? proxy(onProgress) : undefined)
}
