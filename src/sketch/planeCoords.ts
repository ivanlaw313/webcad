// RETEST18 #4：草圖局部座標 [s,t] ↔ 主平面 CAD 座標（單一真源）。
// 草圖局部係 three 世界嘅平面投影（XY：s=x, t=threeZ=−cadY），所以 XY 草圖嘅 t 同 CAD Y 反號。
// 拉伸（store stToProfile）、草圖點批量孔（holePoints）、狀態列光標讀數 一律經呢度 → 三者同一個 Y，冇鏡像。
export type CardinalPlane = 'XY' | 'XZ' | 'YZ'
type P2 = [number, number]

/** 草圖局部 [s,t] → 平面 CAD 座標：XY=(X,Y)、XZ=(X,Z)、YZ=(Y,Z)。 */
export function sketchLocalToPlane(p: readonly [number, number], plane: CardinalPlane): P2 {
  const [s, t] = p
  return plane === 'XZ' ? [s, t] : plane === 'YZ' ? [-s, t] : [s, -t]
}

/** 反向：平面 CAD 座標 → 草圖局部 [s,t]。 */
export function planeToSketchLocal(p: readonly [number, number], plane: CardinalPlane): P2 {
  const [u, v] = p
  return plane === 'XZ' ? [u, v] : plane === 'YZ' ? [-u, v] : [u, -v]
}

/** 狀態列 ⌖ 讀數：卡片平面顯示 CAD 平面座標（同孔/拉伸落點一致）；自定（arb）平面維持局部座標。 */
export function sketchCursorReadout(p: readonly [number, number], plane: CardinalPlane, arb: boolean): P2 {
  return arb ? [p[0], p[1]] : sketchLocalToPlane(p, plane)
}
