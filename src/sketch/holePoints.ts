// Hole 「從草圖點批量建立」+ 孔心吸附 —— 純函數（node 可測，唔 import store）。
// 來源：進行中草圖 + 時間軸上已完成嘅 XY 草圖（非斜面 arb）。座標一律輸出 CAD XY（孔沿 Z 鑽）。
type P2 = [number, number]
type Shape = { type: string; c?: P2; r?: number; point?: boolean; a?: P2; b?: P2; pts?: P2[]; verts?: P2[]; construction?: boolean; centerline?: boolean; smooth?: boolean; bspline?: boolean; ell?: unknown }
type Src = { shapes: Shape[]; plane: string; arb?: unknown; name?: string }
export type HolePointSketch = { id: string; name: string; pts: P2[] }

// sketch-local [s,t] → CAD XY（同 store stToProfile 'XY'：[s,-t]）
const xy = (p: P2): P2 => [p[0], -p[1]]

export function sketchPointsOf(shapes: readonly Shape[]): P2[] {
  const out: P2[] = []
  for (const sh of shapes) if (sh.type === 'circle' && sh.point && sh.c) out.push(xy(sh.c))
  return out
}

/** 已完成 XY 草圖入面有草圖點嘅候選（時間軸次序，最後 = 最新）。 */
export function finishedSketchPointCandidates(s: { sketchSources: Record<string, Src | undefined>; features: readonly { type: string; sketchId?: string }[] }): HolePointSketch[] {
  const out: HolePointSketch[] = []
  let n = 0
  for (const f of s.features) {
    if (f.type !== 'sketch') continue
    n++
    const id = f.sketchId
    if (!id || out.some((c) => c.id === id)) continue
    const src = s.sketchSources[id]
    if (!src || src.plane !== 'XY' || src.arb) continue
    const pts = sketchPointsOf(src.shapes)
    if (pts.length) out.push({ id, name: src.name || `草圖${n}`, pts })
  }
  return out
}

/** 孔心吸附目標：草圖點、圓心、矩形角、折線頂點（樣條/橢圓唔計）。 */
export function holeSnapTargets(shapes: readonly Shape[]): P2[] {
  const out: P2[] = []
  for (const sh of shapes) {
    if (sh.type === 'circle' && sh.c) out.push(xy(sh.c))
    else if (sh.type === 'rect' && sh.a && sh.b) { const { a, b } = sh; out.push(xy(a), xy([b[0], a[1]]), xy(b), xy([a[0], b[1]])) }
    else if (sh.type === 'poly' && !sh.smooth && !sh.bspline && !sh.ell) for (const v of sh.verts ?? sh.pts ?? []) out.push(xy(v))
  }
  return out
}

export function holeSnapTargetsFromSources(s: { sketchSources: Record<string, (Src & { visible?: boolean }) | undefined> }, active?: readonly Shape[] | null): P2[] {
  const out: P2[] = []
  for (const src of Object.values(s.sketchSources)) if (src && src.plane === 'XY' && !src.arb && src.visible) out.push(...holeSnapTargets(src.shapes))
  if (active) out.push(...holeSnapTargets(active))
  return out
}

/** 最近目標（≤tol mm），冇就 null。 */
export function snapHoleXY(p: P2, targets: readonly P2[], tol = 3): P2 | null {
  let best: P2 | null = null, bd = tol
  for (const t of targets) { const d = Math.hypot(t[0] - p[0], t[1] - p[1]); if (d <= bd) { bd = d; best = t } }
  return best ? [best[0], best[1]] : null
}
