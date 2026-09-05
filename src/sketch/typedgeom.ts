// GM-FP1 (Fusion-parity W1)：草图打字尺寸嘅纯几何 —— 抽出 store.ts 令 node 单元测试可直接 import
// （store.ts 系 16k 行 monolith，含 worker/wasm import，node 下面 import 唔起）。呢度只有纯数学，零依赖。
export type Pt = [number, number]

// #10：折线打字段 = 长度(lenStr) + 角度(angStr)。角度相对上一段方向 prevDir（无上一段 → 绝对 +X 轴）。
// 返回该段终点。未锁字段跟随光标（cursor）；角度锁而长度未锁 → 长度 = 光标沿锁定方向嘅投影（≥0）。
export function polylineTypedEndpoint(last: Pt, prevDir: number | null, cursor: Pt, lenStr: string, angStr: string): Pt {
  const curDx = cursor[0] - last[0], curDy = cursor[1] - last[1]
  const curLen = Math.hypot(curDx, curDy)
  const base = prevDir == null ? 0 : prevDir
  const lv = parseFloat(lenStr), av = parseFloat(angStr)
  const lenLocked = lenStr !== '' && isFinite(lv)
  const angLocked = angStr !== '' && isFinite(av)
  const dir = angLocked ? base + (av * Math.PI) / 180 : (curLen > 1e-9 ? Math.atan2(curDy, curDx) : base)
  let L: number
  if (lenLocked) L = lv
  else if (angLocked) L = Math.max(0, curDx * Math.cos(dir) + curDy * Math.sin(dir))   // 光标沿锁定方向嘅投影
  else L = curLen
  return [last[0] + L * Math.cos(dir), last[1] + L * Math.sin(dir)]
}

// #15：两点圆（直径两端）→ 圆心 = 中点、半径 = 两点距离/2。
export function twoPointCircle(a: Pt, b: Pt): { c: Pt; r: number } {
  return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], r: Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 }
}
