export type ViewBookmark = {
  name: string
  pos: [number, number, number]
  target: [number, number, number]
  up?: [number, number, number]
  zoom?: number
  projection?: 'ortho' | 'persp'
}
export type ViewCapture = Omit<ViewBookmark, 'name'>
const vector = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(n => typeof n === 'number' && Number.isFinite(n))
/** Camera coordinates are Three coordinates, not CAD coordinates. Legacy bookmarks remain valid. */
export function sanitizeViewBookmark(value: unknown): ViewBookmark | null {
  if (!value || typeof value !== 'object') return null
  const b = value as ViewBookmark
  if (!vector(b.pos) || !vector(b.target)) return null
  const d = b.pos.map((v, i) => v - b.target[i])
  if (Math.hypot(...d) < 1e-9) return null
  let up: [number, number, number] = vector(b.up) ? [...b.up] : [0, 1, 0]
  const crossLength = () => Math.hypot(d[1]*up[2]-d[2]*up[1], d[2]*up[0]-d[0]*up[2], d[0]*up[1]-d[1]*up[0])
  if (crossLength() < 1e-8 * Math.hypot(...d) * Math.max(1, Math.hypot(...up))) up = Math.abs(d[2]) < Math.hypot(...d)*0.9 ? [0,0,-1] : [1,0,0]
  const length = Math.hypot(...up)
  up = up.map(v => v/length) as typeof up
  return {name: typeof b.name === 'string' ? b.name : '视图', pos:[...b.pos], target:[...b.target], up,
    ...(typeof b.zoom === 'number' && Number.isFinite(b.zoom) && b.zoom > 0 ? {zoom:b.zoom} : {}),
    ...(b.projection === 'ortho' || b.projection === 'persp' ? {projection:b.projection} : {})}
}
