// UX2 #8：瀏覽器草圖行顯示輪廓數（Fusion 草圖下面列 Profiles）— 封閉輪廓 vs 開放線，一眼知道拉伸/旋轉會揀到幾多個。
type Shape = { type: string; open?: boolean; construction?: boolean; point?: boolean; pts?: [number, number][] }
export function sketchProfileCount(shapes: readonly Shape[]): { closed: number; open: number } {
  let closed = 0, open = 0
  for (const s of shapes) {
    if (!s || s.construction || s.point) continue
    if (s.type === 'poly' && s.open) {
      const p = s.pts ?? []
      // 首尾重合嘅「開放」折線其實係封閉圈
      if (p.length >= 4 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-6) closed++
      else open++
    } else if (s.type === 'text') continue
    else closed++
  }
  return { closed, open }
}
