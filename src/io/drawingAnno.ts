// T784（S63）：工程图手动标注嘅持久化数据形状 — store 同 DrawingPanel 共用（独立模块避免循环 import）。
// 标注全部锚定喺【视图 mm 坐标系】（纸面空间）：模型重生成后视图原点/比例不变 → 标注生还；
// 但几何本身改咗（孔搬位/件变大）标注唔会跟住郁 — 呢个限制喺 UI title 写明（纸面锚定，非几何关联）。

export type DTol = { u: number; l: number }                       // 上/下偏差 mm
export type DMDim = { x1: number; y1: number; x2: number; y2: number; tol?: DTol }   // 两点线性尺寸
export type DRDim = { cx: number; cy: number; r: number; kind: 'r' | 'd'; tol?: DTol; fit?: string }  // 半径/直径
export type DADim = { vx: number; vy: number; a1: number; a2: number }                // 角度（顶点+两方向）
export type DNoteKind = 'thread' | 'chamfer' | 'surf' | 'text'
export type DNote = { ax: number; ay: number; text: string; kind: DNoteKind }         // 螺纹/倒角/粗糙度/文字
export type DDatum = { x: number; y: number; label: string }                          // GD&T 基准
export type DFCF = { x: number; y: number; sym: string; tol: string; datum: string }  // 形位公差框
export type DDetail = { cx: number; cy: number; r: number }                           // 局部放大圈
export type DOrd = { ox: number; oy: number; pts: [number, number][] }                // T791 坐标式标注：原点 + 逐点（多孔板）

// 全套手动标注 + 图纸设置（标题栏/公差/制式）— 一个对象入 save payload。
export type DrawingAnno = {
  manualDims: Record<string, DMDim[]>
  manualRDims: Record<string, DRDim[]>
  manualADims: Record<string, DADim[]>
  manualDatums: Record<string, DDatum[]>
  manualFCF: Record<string, DFCF[]>
  manualNotes: Record<string, DNote[]>
  details: Record<string, DDetail[]>
  ordinates: Record<string, DOrd>                                                     // T791：每视图一个原点 + 点列
  // 图纸设置（同一张图嘅出图状态，一齐持久化）
  scale: string; drawnBy: string; genTol: string; materialTxt: string
  firstAngle: boolean; gbFrame: boolean
  sheet: 'A4' | 'A3'                                                                  // T791：图幅（GB 图框尺寸）
  autoTolOn: boolean; autoTol: number
  showHidden: boolean; showCallouts: boolean
}

export const EMPTY_ANNO: DrawingAnno = {
  manualDims: {}, manualRDims: {}, manualADims: {}, manualDatums: {}, manualFCF: {}, manualNotes: {}, details: {}, ordinates: {},
  scale: '1:1', drawnBy: '', genTol: '', materialTxt: '', firstAngle: false, gbFrame: false, sheet: 'A4',
  autoTolOn: false, autoTol: 0.1, showHidden: true, showCallouts: true,
}

// 还原旧存档冇呢个 key / 部分字段缺失嘅情况：逐字段补默认（防 undefined 落 UI）。
export function hydrateAnno(raw: unknown): DrawingAnno {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<DrawingAnno>
  return { ...EMPTY_ANNO, ...r,
    manualDims: r.manualDims ?? {}, manualRDims: r.manualRDims ?? {}, manualADims: r.manualADims ?? {},
    manualDatums: r.manualDatums ?? {}, manualFCF: r.manualFCF ?? {}, manualNotes: r.manualNotes ?? {}, details: r.details ?? {}, ordinates: r.ordinates ?? {} }
}
