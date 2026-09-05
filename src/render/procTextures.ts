import { CanvasTexture, RepeatWrapping, SRGBColorSpace, LinearSRGBColorSpace, type Texture } from 'three'
const cache = new Map<string, Texture>()
function mk(draw: (ctx: CanvasRenderingContext2D, n: number) => void, srgb = true, n = 512): Texture {
  const c = document.createElement('canvas'); c.width = c.height = n
  const ctx = c.getContext('2d')!; draw(ctx, n)
  const t = new CanvasTexture(c); t.wrapS = t.wrapT = RepeatWrapping
  t.colorSpace = srgb ? SRGBColorSpace : LinearSRGBColorSpace; t.anisotropy = 4; return t
}
export const TEXTURE_KEYS = { '': '无', wood: '木纹', brushed: '拉丝', matte: '磨砂' } as const
export function getProcTexture(key: string): Texture | null {
  if (!key) return null
  if (cache.has(key)) return cache.get(key)!
  let t: Texture
  if (key === 'wood') t = mk((g, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const r = 0.5 + 0.5 * Math.sin(x / n * Math.PI * 14 + Math.sin(y / n * Math.PI * 2) * 1.2)
      const g2 = r * 0.35 + (Math.random() * 0.06); const base = 90 + g2 * 120
      g.fillStyle = `rgb(${base | 0},${(base * 0.62) | 0},${(base * 0.32) | 0})`; g.fillRect(x, y, 1, 1) } })
  else if (key === 'brushed') t = mk((g, n) => { g.fillStyle = '#b9bfc6'; g.fillRect(0, 0, n, n)
    for (let i = 0; i < n * 40; i++) { const y = Math.random() * n, v = 150 + Math.random() * 80
      g.strokeStyle = `rgba(${v | 0},${v | 0},${(v + 6) | 0},0.06)`; g.beginPath(); g.moveTo(0, y); g.lineTo(n, y + (Math.random() - .5) * 2); g.stroke() } })
  else t = mk((g, n) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const v = 110 + (Math.random() * 30 - 15); g.fillStyle = `rgb(${v|0},${v|0},${v|0})`; g.fillRect(x, y, 1, 1) } }, false)
  cache.set(key, t); return t
}
