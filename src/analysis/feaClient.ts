// FEA worker 客户端 — 懒创建独立 worker（首次运行先开），失败直接报错唔静默。
import { wrap, proxy, type Remote } from 'comlink'
import type { FeaInput, FeaResult, ModalInput, ModalResult, BucklingInput, BucklingResult, PrestressedModalInput, TopoptInput, TopoptResult, ThermalInput, ThermalResult, ThermalStressInput } from './voxelfea'

type FeaAPI = {
  run(inp: Omit<FeaInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): FeaResult
  modal(inp: Omit<ModalInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): ModalResult
  buckling(inp: Omit<BucklingInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): BucklingResult
  prestressedModal(inp: Omit<PrestressedModalInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): ModalResult
  topopt(inp: Omit<TopoptInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): TopoptResult
  thermal(inp: Omit<ThermalInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): ThermalResult
  thermalStress(inp: Omit<ThermalStressInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): FeaResult
}

let api: Remote<FeaAPI> | null = null

function ensureApi(): Remote<FeaAPI> {
  if (!api) {
    const w = new Worker(new URL('../worker/fea.worker.ts', import.meta.url), { type: 'module', name: 'fea' })
    api = wrap<FeaAPI>(w)
  }
  return api
}

export async function runFeaInWorker(
  inp: Omit<FeaInput, 'onProgress'>,
  onProgress?: (phase: string, frac: number) => void,
): Promise<FeaResult> {
  return ensureApi().run(inp, onProgress ? proxy(onProgress) : undefined)
}

export async function runModalInWorker(
  inp: Omit<ModalInput, 'onProgress'>,
  onProgress?: (phase: string, frac: number) => void,
): Promise<ModalResult> {
  return ensureApi().modal(inp, onProgress ? proxy(onProgress) : undefined)
}

export async function runBucklingInWorker(
  inp: Omit<BucklingInput, 'onProgress'>,
  onProgress?: (phase: string, frac: number) => void,
): Promise<BucklingResult> {
  return ensureApi().buckling(inp, onProgress ? proxy(onProgress) : undefined)
}

export async function runPrestressedModalInWorker(
  inp: Omit<PrestressedModalInput, 'onProgress'>,
  onProgress?: (phase: string, frac: number) => void,
): Promise<ModalResult> {
  return ensureApi().prestressedModal(inp, onProgress ? proxy(onProgress) : undefined)
}

export async function runTopoptInWorker(
  inp: Omit<TopoptInput, 'onProgress'>,
  onProgress?: (phase: string, frac: number) => void,
): Promise<TopoptResult> {
  return ensureApi().topopt(inp, onProgress ? proxy(onProgress) : undefined)
}

export async function runThermalInWorker(
  inp: Omit<ThermalInput, 'onProgress'>,
  onProgress?: (phase: string, frac: number) => void,
): Promise<ThermalResult> {
  return ensureApi().thermal(inp, onProgress ? proxy(onProgress) : undefined)
}

export async function runThermalStressInWorker(
  inp: Omit<ThermalStressInput, 'onProgress'>,
  onProgress?: (phase: string, frac: number) => void,
): Promise<FeaResult> {
  return ensureApi().thermalStress(inp, onProgress ? proxy(onProgress) : undefined)
}
