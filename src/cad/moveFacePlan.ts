// moveFacePlan.ts — GM-B2「移动面 Move Face」v1 纯决策核（无 OCCT / replicad 依赖，可喺 Node/tsx 直接 import 测试）。
//
// 点解要抽出嚟做独立模块：cad.worker.ts 用咗 Vite 专属 `?url` / wasm import，喺 Node/tsx 跑唔起
//   （同 edgeFingerprint.ts / faceFingerprint.ts / topoFingerprint.ts 一样嘅切法）。故把「究竟行边条内核路径」
//   嘅纯逻辑放呢度：worker exec 同 tests/moveface.test.mjs 都 import 呢一个 helper，保证测嘅决策
//   同 worker 真行嘅决策系【同一段码】。
//
// 内核事实（tests/moveface-probe.test.mjs Node 实证，11/13 pass）：
//   • ReplaceFaceNear = 平面顶替 + 邻面（含相邻圆角）内核重解 —— 只做【朝内/切到平面】；朝外返 NULL。
//   • 朝外长大：无重解内核路径 → 用 prism fuse（pushpull 平面路径同款）。
//   • 倾斜：ReplaceFaceNear 喂倾斜平面（过面心）得 valid solid；铰点正正落边缘会退化 NULL。

export type MoveFaceOp = 'skip-zero' | 'replace-inward' | 'prism-outward' | 'tilt' | 'reject-multi-tilt'

export interface MoveFacePlan {
  op: MoveFaceOp
  angle?: number   // 'tilt' 时：已钳 |angle| ≤ 60 嘅有效角
  note?: string    // 'skip-zero' / 'reject-multi-tilt' 时嘅诚实原因
}

// 由 feature 参数决定移动面走边条几何路径。纯函数、无副作用。
//   mode 'offset'（缺省）：dist<0 → ReplaceFaceNear 朝内重解；dist>0 → prism fuse 朝外长大；dist==0 → 跳过。
//   mode 'tilt'：ReplaceFaceNear 喂倾斜平面（角度钳 ±60°）；angle==0 → 跳过。
//   GM-L2（v2 多面）：nfaces 缺省=1（旧档单面逐字节）。offset 支持多面串链（worker 逐面顺序喂内核，probe P5 证）；
//     tilt 多面【方向有歧义】（每面各自面内轴掀起，用户意图唔明）→ 诚实 reject（唔猜），叫用户逐面倾斜或改偏移。
export function _moveFacePlan(f: { mode?: 'offset' | 'tilt'; dist: number; angle?: number; nfaces?: number }): MoveFacePlan {
  const mode = f.mode === 'tilt' ? 'tilt' : 'offset'
  const nf = Number.isFinite(f.nfaces as number) ? (f.nfaces as number) : 1   // GM-L2：拾面数（缺省单面）
  if (mode === 'tilt') {
    if (nf > 1) return { op: 'reject-multi-tilt', note: '倾斜暂唔支持多面（每面倾斜方向有歧义）— 请逐面倾斜，或改用「偏移」多面串链' }   // GM-L2：多面倾斜诚实 reject
    let a = Number.isFinite(f.angle as number) ? (f.angle as number) : 0
    if (a > 60) a = 60; else if (a < -60) a = -60   // 钳 |angle| ≤ 60（内核倾斜太尽会退化）
    if (Math.abs(a) < 1e-6) return { op: 'skip-zero', note: '倾斜角为 0 — 跳过（保持原样）' }
    return { op: 'tilt', angle: a }
  }
  if (!Number.isFinite(f.dist) || Math.abs(f.dist) < 1e-6) return { op: 'skip-zero', note: '距离为 0 — 跳过（保持原样）' }
  return f.dist < 0 ? { op: 'replace-inward' } : { op: 'prism-outward' }
}
