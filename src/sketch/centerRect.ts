import { inferCoincident, skConId, type FShape, type SkCon } from './freesolve'

type P = [number, number]

// SKETCH12 #3：中心矩形落點喺原點／現有點時，加一條構造對角線（兩端重合矩形對角）+「中點」約束把中心鎖到該點 →
// 位置自由度正確扣減（中心喺原點 = DOF 2，只剩寬高）。中心冇吸附到任何點 → 回傳 null（DOF 4：寬、高、中心 x/y）。
// 版面：others（現有形狀，索引不變）→ 對角線 = others.length → 矩形 = others.length + 1。純函數。
export function centerRectExtras(others: FShape[], rect: FShape, center: P, existing: SkCon[]): { diag: FShape; cons: SkCon[] } | null {
  if (rect.type !== 'rect') return null
  // 臨時草圖點：只認精確重合（1e-4，即吸附結果），原點優先
  const probe = [...others, { type: 'circle', c: center, r: 0, point: true } as FShape]
  const hit = inferCoincident(probe, probe.length - 1, existing)[0]
  if (!hit || hit.kind !== 'con' || !hit.b) return null
  const D = others.length, R = D + 1
  const a = rect.a as P, b = rect.b as P
  const diag = { type: 'poly', pts: [a, b], verts: [a, b], bulges: [0], open: true, construction: true } as FShape
  return { diag, cons: [
    { id: skConId(), kind: 'con', type: 'coincident', a: { kind: 'pt', shape: R, idx: 0 }, b: { kind: 'pt', shape: D, idx: 0 } },
    { id: skConId(), kind: 'con', type: 'coincident', a: { kind: 'pt', shape: R, idx: 2 }, b: { kind: 'pt', shape: D, idx: 1 } },
    { id: skConId(), kind: 'con', type: 'midpoint', a: hit.b, b: { kind: 'edge', shape: D, idx: 0 } },
  ] }
}
