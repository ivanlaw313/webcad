/// <reference lib="webworker" />
// 注塑充填趋势专用 worker — 同 OCCT 内核 worker / FEA worker 分开：
// runMoldFlow 系同步长计算（体素化 + Dijkstra 可以跑几秒），唔可以阻住几何重建；
// progress 经 Comlink proxy 回传，输入无效会 throw 中文 Error（comlink 原样传返）。
import { expose } from 'comlink'
import { runMoldFlow, type MoldInput, type MoldResult } from '../analysis/moldflow'

const api = {
  run(inp: Omit<MoldInput, 'onProgress'>, onProgress?: (pct: number, note: string) => void): MoldResult {
    return runMoldFlow({ ...inp, onProgress })
  },
}

export type MoldWorkerAPI = typeof api
expose(api)
