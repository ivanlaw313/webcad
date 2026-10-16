// 浇口类型谱 —— 独立轻模块（无任何重依赖），令 store/UI 可直接 import 而唔会拖成个模流求解器入主 bundle。
// moldflow.ts re-export 返呢度，旧引用唔破。

export type GateType = 'edge' | 'pin' | 'sub' | 'fan' | 'direct' | 'tab'
export interface GateTypeSpec { name: string; dia: number; widthMM: number; restrictK: number; fanCells: number; shear: 'low' | 'med' | 'high'; note: string }

// 限制系数 K = 趋势级相对值：浇口压降 ΔP ≈ K · Qg / dia³ · Cf（Cf 校准，令点/潛伏=高压降、扇/直接=低）。
export const GATE_TYPES: Record<GateType, GateTypeSpec> = {
  edge:   { name: '側澆口/邊緣', dia: 2.0, widthMM: 0,  restrictK: 1.0, fanCells: 0, shear: 'med',  note: '分模面邊緣矩形澆口，通用首選' },
  pin:    { name: '點澆口',      dia: 1.0, widthMM: 0,  restrictK: 4.0, fanCells: 0, shear: 'high', note: '細小、自動斷澆口、壓降大、凍結快（三板模/熱流道）' },
  sub:    { name: '潛伏式',      dia: 1.0, widthMM: 0,  restrictK: 4.5, fanCells: 0, shear: 'high', note: '分模面下方進料、頂出自動剪斷、壓降大' },
  fan:    { name: '扇形澆口',    dia: 5.5, widthMM: 18, restrictK: 0.5, fanCells: 7, shear: 'low',  note: '寬口鋪開成平面前沿，減翹曲/低剪切（闊扁平件）' },
  direct: { name: '直接/主流道',  dia: 5.0, widthMM: 0,  restrictK: 0.2, fanCells: 0, shear: 'low',  note: '主流道直入、壓降最低、痕大（單腔大件）' },
  tab:    { name: '護耳澆口',    dia: 2.5, widthMM: 0,  restrictK: 0.8, fanCells: 0, shear: 'med',  note: '經護耳進料、降澆口附近應力/噴射（透明件）' },
}

/** 单浇口规格（对齐 MoldInput.gates）：类型 + 流量权重（手动流道尺寸）。 */
export interface GateSpec { type?: GateType; flowWeight?: number }

/** 逐浇口统计（求解器模式）：类型、流量占比、注射压力（型腔ΔP+浇口ΔP）、责任域充填时间。 */
export interface GateStat { type: GateType; flowFrac: number; pInjMPa: number; gateDpMPa: number; fillEnd: number; domainVox: number }
