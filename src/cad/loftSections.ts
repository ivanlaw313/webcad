/**
 * 放樣截面清單（store / 對話框 / 預覽共用嘅純邏輯）：
 *  - 有效次序：全部截面喺同一參考面（同 Origin 平面或同一斜面）而用戶未手動排過 → 按偏移 z 排；
 *    否則按清單次序（Fusion「截面次序 = 揀選次序」）。對話框、預覽、確定全部用同一個次序。
 *  - 揀平面做截面：面外環 3D 點 → 任意平面框架（o / xd / n）+ 本地 2D 輪廓。
 */
export type V3 = [number, number, number]
export type ArbPlane = { o: V3; xd: V3; n: V3 }
export type LoftSecLike = { z: number; plane?: string; arbPlane?: ArbPlane }

const frameKey = (s: LoftSecLike) => s.arbPlane ? `arb:${JSON.stringify(s.arbPlane)}` : `origin:${s.plane || 'XY'}`

/** 有效截面次序（index 陣列）。 */
export function loftEffectiveOrder(secs: LoftSecLike[], manual: boolean): number[] {
  const idx = secs.map((_, i) => i)
  if (manual || secs.length < 2) return idx
  const same = secs.every((s) => frameKey(s) === frameKey(secs[0]))
  return same ? idx.sort((a, b) => secs[a].z - secs[b].z) : idx
}

/** 將清單入面第 i 個（按有效次序）向前／後移一格，回傳新嘅實際陣列次序（index 陣列）。 */
export function loftMoveOrder(secs: LoftSecLike[], manual: boolean, i: number, dir: -1 | 1): number[] | null {
  const ord = loftEffectiveOrder(secs, manual)
  const j = i + dir
  if (i < 0 || i >= ord.length || j < 0 || j >= ord.length) return null
  const out = ord.slice();[out[i], out[j]] = [out[j], out[i]]
  return out
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l] }

/** 平面框架：o = 給定點，n = 單位法向，xd = 穩定參考軸（同斜面草圖 startSketchOnFace 一致：Z 參考，接近 Z 法向時用 X）。 */
export function faceFrame(o: V3, n: V3): ArbPlane {
  const nn = unit(n)
  const ref: V3 = Math.abs(nn[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
  const d = dot(ref, nn)
  const xd = unit([ref[0] - d * nn[0], ref[1] - d * nn[1], ref[2] - d * nn[2]])
  return { o: [o[0], o[1], o[2]], xd, n: nn }
}

/** 世界點 → 框架本地 2D（u 沿 xd，v 沿 n×xd —— 同 replicad Plane 嘅 yDir 定義一致）。 */
export function toFrameUV(fr: ArbPlane, p: V3): [number, number] {
  const yd = cross(fr.n, fr.xd)
  const d = sub(p, fr.o)
  return [dot(d, fr.xd), dot(d, yd)]
}

/** 平面外框 → 放樣截面（poly 或精確 circle）。 */
export function faceLoopToSection(face: { loop: V3[]; normal: V3; center: V3; circle?: { c: V3; r: number } }):
  { profile: { kind: 'circle'; c: [number, number]; r: number } | { kind: 'poly'; pts: [number, number][] }; z: number; plane: 'XY'; arbPlane: ArbPlane } {
  if (face.circle) {
    const fr = faceFrame(face.circle.c, face.normal)
    return { profile: { kind: 'circle', c: [0, 0], r: face.circle.r }, z: 0, plane: 'XY', arbPlane: fr }
  }
  const fr = faceFrame(face.center, face.normal)
  const pts = face.loop.map((p) => toFrameUV(fr, p)).map(([u, v]) => [Math.round(u * 1e6) / 1e6, Math.round(v * 1e6) / 1e6] as [number, number])
  return { profile: { kind: 'poly', pts }, z: 0, plane: 'XY', arbPlane: fr }
}

/** 對話框顯示用嘅截面名（繁體）。 */
export function loftSectionLabel(sec: LoftSecLike, src?: { label?: string } | null): string {
  if (src?.label) return src.label
  if (sec.arbPlane) return '斜參考面截面'
  return `${sec.plane || 'XY'} @ ${+sec.z.toFixed(2)}`
}
