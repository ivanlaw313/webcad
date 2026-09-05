// GM-X1 #12：持久化分析节点数组模型 —— 纯函数 reducer。对标 Fusion 浏览树 Analysis 文件夹：
// 曲面分析（斑马/曲率/高斯/梳/拔模/斜度/最小半径/剖面）存为可开关节点，逐个眼睛开关、非破坏。
//
// webcad 旧况：inspectShade 等系互斥即时叠层, 唔持久化。呢度加一层「分析节点表」记录已跑过嘅分析
// （type + 参数 + 可见性）, 令佢哋可喺浏览树逐个开关 / 删除。overlay 渲染仍复用旧机制, 呢个只管【节点表】。

export type AnalysisType = 'zebra' | 'curv' | 'gausscurv' | 'comb' | 'kmax' | 'kmin' | 'draft' | 'slope' | 'minradius' | 'section' | 'access'

export interface AnalysisNode {
  id: string
  type: AnalysisType
  label: string
  visible: boolean
  params?: Record<string, unknown>   // 例：draft.pull / slope.ref / section.axis+offset / zebra.stripe
}

export const ANALYSIS_LABELS: Record<AnalysisType, string> = {
  zebra: '斑马纹', curv: '曲率趋势', gausscurv: '高斯曲率', comb: '曲率梳',
  kmax: '最大主曲率', kmin: '最小主曲率',
  draft: '拔模分析', slope: '斜度分析', minradius: '最小曲率半径', section: '剖切分析', access: '脱模可达性',
}

// 加 / 更新一个分析节点。同 type 已存在 → 就地更新参数 + 设为可见（对标「重跑同类分析覆盖」）。
// 返回新数组（唔改入参）。id 由 caller 供（keep 纯）。
export function upsertAnalysis(arr: AnalysisNode[], node: Omit<AnalysisNode, 'label'> & { label?: string }): AnalysisNode[] {
  const label = node.label ?? ANALYSIS_LABELS[node.type]
  const i = arr.findIndex((a) => a.type === node.type)
  const full: AnalysisNode = { id: node.id, type: node.type, label, visible: node.visible, params: node.params }
  if (i < 0) return [...arr, full]
  const out = arr.slice(); out[i] = { ...full, id: arr[i].id }   // 保留旧 id（浏览树稳定）
  return out
}

export function toggleAnalysisVisible(arr: AnalysisNode[], id: string): AnalysisNode[] {
  return arr.map((a) => (a.id === id ? { ...a, visible: !a.visible } : a))
}

export function removeAnalysis(arr: AnalysisNode[], id: string): AnalysisNode[] {
  return arr.filter((a) => a.id !== id)
}

// 当前应该「生效」嘅分析 type（可见 + 排最后加入者优先 —— overlay 互斥, 只可显示一个）。
export function activeAnalysisType(arr: AnalysisNode[]): AnalysisType | null {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i].visible) return arr[i].type
  return null
}
