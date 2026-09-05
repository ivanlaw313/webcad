// 注塑趋势 worker 客户端 — 懒创建独立 worker（首次运行先开），失败直接报错唔静默。
// （结构同 feaClient.ts 一致：comlink wrap 单例 + onProgress proxy。）
import { wrap, proxy, type Remote } from 'comlink'
import type { MoldInput, MoldResult } from './moldflow'

type MoldAPI = { run(inp: Omit<MoldInput, 'onProgress'>, onProgress?: (pct: number, note: string) => void): MoldResult }

let api: Remote<MoldAPI> | null = null

/** 喺独立 worker 入面跑充填趋势模拟；inp.onProgress 经 comlink proxy 回传主线程。 */
export async function runMold(inp: MoldInput): Promise<MoldResult> {
  if (!api) {
    const w = new Worker(new URL('../worker/mold.worker.ts', import.meta.url), { type: 'module', name: 'mold' })
    api = wrap<MoldAPI>(w)
  }
  const { onProgress, ...rest } = inp
  return api.run(rest, onProgress ? proxy(onProgress) : undefined)
}
