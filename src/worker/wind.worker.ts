/// <reference lib="webworker" />
// 风洞/水洞趋势 worker — 同 OCCT 内核 / FEA / 模流 worker 分开：LBM 流场迭代系同步长计算（几秒~分钟），
// 唔可以阻住几何重建；progress 经 Comlink proxy 回传，输入无效会 throw 中文 Error（comlink 原样传返）。
import { expose, transfer } from 'comlink'
import { runWindTunnel, type WindInput, type WindResult } from '../analysis/windtunnel'

const api = {
  run(inp: Omit<WindInput, 'onProgress'>, onProgress?: (pct: number, note: string) => void): WindResult {
    const r = runWindTunnel({ ...inp, onProgress })
    // S1：加咗速度场 3D texture（res 48 时 ~7 MB）之后，comlink 默认 structured clone 会【整份 copy】一次 →
    // 改用 transferable 零拷贝移交。⚠ transfer 之后呢啲 buffer 喺 worker 侧会 detach，下面唔可以再读（我哋直接 return）。
    const bufs: ArrayBuffer[] = []
    const take = (a?: { buffer: ArrayBufferLike }) => {
      const b = a?.buffer
      if (b instanceof ArrayBuffer && !bufs.includes(b)) bufs.push(b)
    }
    take(r.centers); take(r.cp); take(r.surfSpeed); take(r.flowPts); take(r.flowVel)
    take(r.streamPts); take(r.streamSpeed); take(r.streamLineOffsets); take(r.volData)
    return transfer(r, bufs)
  },
}

export type WindWorkerAPI = typeof api
expose(api)
