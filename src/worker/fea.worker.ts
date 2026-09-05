/// <reference lib="webworker" />
// 体素趋势 FEA 专用 worker — 同 OCCT 内核 worker 分开：FEA 求解（CG 迭代）可以跑十几秒，
// 唔可以阻住几何重建。runVoxelFea 系同步长计算，progress 经 Comlink proxy 回传。
import { expose } from 'comlink'
import { runVoxelFea, runVoxelModal, runVoxelBuckling, runVoxelPrestressedModal, runTopologyOpt, runVoxelThermal, runVoxelThermalStress, type FeaInput, type FeaResult, type ModalInput, type ModalResult, type BucklingInput, type BucklingResult, type PrestressedModalInput, type TopoptInput, type TopoptResult, type ThermalInput, type ThermalResult, type ThermalStressInput } from '../analysis/voxelfea'

const api = {
  run(inp: Omit<FeaInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): FeaResult {
    return runVoxelFea({ ...inp, onProgress })
  },
  // 模态分析（固有频率）— 同 worker，复用体素化/刚度/CG；逆幂迭代可跑十几秒。
  modal(inp: Omit<ModalInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): ModalResult {
    return runVoxelModal({ ...inp, onProgress })
  },
  // 线性屈曲分析（载荷因子）— 静力预应力 + 几何刚度 + 逆幂迭代。
  buckling(inp: Omit<BucklingInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): BucklingResult {
    return runVoxelBuckling({ ...inp, onProgress })
  },
  // 预应力（应力刚化）模态 — 静力预载 + 几何刚度 Kg + (K+Kg) 逆幂迭代。返回 ModalResult（复用模态渲染）。
  prestressedModal(inp: Omit<PrestressedModalInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): ModalResult {
    return runVoxelPrestressedModal({ ...inp, onProgress })
  },
  // 生成式设计 / 拓扑优化（SIMP）— 每迭代一次静力解，可跑几十秒。
  topopt(inp: Omit<TopoptInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): TopoptResult {
    return runTopologyOpt({ ...inp, onProgress })
  },
  // 稳态热分析（标量导热）。
  thermal(inp: Omit<ThermalInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): ThermalResult {
    return runVoxelThermal({ ...inp, onProgress })
  },
  // 耦合热-应力（先解温度场，再以热初应变 ε₀=αΔT 加载结构 FEM）。返回 FeaResult。
  thermalStress(inp: Omit<ThermalStressInput, 'onProgress'>, onProgress?: (phase: string, frac: number) => void): FeaResult {
    return runVoxelThermalStress({ ...inp, onProgress })
  },
}

export type FeaWorkerAPI = typeof api
expose(api)
