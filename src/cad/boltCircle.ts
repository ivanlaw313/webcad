// 螺栓孔圈（bolt circle / PCD）圓心計算 —— ★ 預覽同結果嘅唯一來源 ★
//
// BUG-515：孔對話框預覽只畫一個孔，確定之後鑽咗 64 個。根因唔單止係預覽忘記畫，
// 而係【兩邊各自計一次】：store 嘅 holeCommit 同 SketchLayer 嘅 HolePreview 各有
// 一份 clamp + 三角函數。只要有一邊改過，預覽就同結果唔同 —— 而用戶係信預覽落刀嘅。
// 所以兩邊都要行呢一個函數，令「飄」喺結構上唔可能發生。

export const BOLT_COUNT_MIN = 2
export const BOLT_COUNT_MAX = 64
export const BOLT_PCD_RADIUS_MIN = 0.5

/** 夾取孔數：非數／0／小數 → 落返合法範圍（預設 4）。 */
export function boltCircleCount(raw: number): number {
  return Math.max(BOLT_COUNT_MIN, Math.min(BOLT_COUNT_MAX, Math.round(raw) || 4))
}

/** 夾取節圓半徑：PCD/2，但唔准細到變成同心重疊。 */
export function boltCircleRadius(pcd: number): number {
  return Math.max(BOLT_PCD_RADIUS_MIN, pcd / 2)
}

/**
 * 均布圓心（CAD XY）。第 0 個固定喺 +X 方向，逆時針排 —— 次序唔准變，
 * 因為特徵樹存落去嘅 centers 要同重放時逐個對得上。
 */
export function boltCircleCenters(cx: number, cy: number, rawCount: number, pcd: number): [number, number][] {
  const n = boltCircleCount(rawCount)
  const r = boltCircleRadius(pcd)
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number]
  })
}

/* ── BUG-521：孔圈嘅「已鑽 N 個」要係真數目 ──────────────────────────────
 * QA 實測（v2.17）：PCD Ø200 喺 80×40 件上 → toast 話「已鑽 6 個」但體積冇變、
 * 一個孔都冇；PCD Ø1 → 6 個孔疊成一個洞；偏後點 → 3 個得 2 個。
 * 「畫面數字 ≠ 實際結果」係最危險嘅一類，所以確定之前就要篩同報。 */

export type BoltCircleCheck = {
  /** 真正落喺件範圍內、而且唔會互相重疊嘅圓心。 */
  kept: [number, number][]
  /** 出咗件外嘅數目。 */
  outside: number
  /** 同前一個孔重疊（圓心距 < 兩半徑和）而被合併嘅數目。 */
  overlapping: number
  /** 給用戶睇嘅警告（冇問題就係空字串）。 */
  warning: string
}

/**
 * 篩走出件外同互相重疊嘅孔。
 * bbox 用件嘅 XY 範圍（CAD mm）；holeR 係單孔半徑。
 * 保守做法：圓心喺 bbox 之外就算出界（孔心唔喺料上面，一定切唔到）。
 */
export function checkBoltCircle(
  centers: [number, number][],
  holeR: number,
  bbox: { minX: number; maxX: number; minY: number; maxY: number } | null,
): BoltCircleCheck {
  const kept: [number, number][] = []
  let outside = 0
  let overlapping = 0
  for (const c of centers) {
    if (bbox && (c[0] < bbox.minX || c[0] > bbox.maxX || c[1] < bbox.minY || c[1] > bbox.maxY)) { outside++; continue }
    // 重疊：同已保留嘅任何一個孔圓心距 < 2r（切出嚟會連成一個洞，數目同用戶見到唔同）
    if (kept.some((k) => Math.hypot(k[0] - c[0], k[1] - c[1]) < holeR * 2 - 1e-9)) { overlapping++; continue }
    kept.push(c)
  }
  const bits: string[] = []
  if (outside) bits.push(`${outside} 個在件範圍外`)
  if (overlapping) bits.push(`${overlapping} 個與其他孔重疊`)
  const warning = bits.length
    ? `螺栓孔圈：${centers.length} 個孔之中 ${bits.join('、')} —— 實際只會鑽到 ${kept.length} 個`
    : ''
  return { kept, outside, overlapping, warning }
}
