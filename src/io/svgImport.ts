// Self-written SVG → 2D profile importer (logos / icons / online vector art → extrudable 3D). Uses the
// browser's native SVG engine: geometry is cloned into a live offscreen <svg> so each element's getCTM()
// resolves the full transform chain (group <g transform>, nested transforms), then <path> curves are
// flattened via getTotalLength / getPointAtLength. Reads <circle>, <rect>, <polygon>, <polyline> too.
// Y is flipped (SVG y-down → CAD y-up) so the part extrudes upright. License-safe: no dependency.
import type { ImpProfile } from './dxfImport'

const NS = 'http://www.w3.org/2000/svg'

// SVG permits either comma or whitespace separated coordinate pairs.  Keeping this
// small parser pure lets import tests cover files that use the common `0 0 20 0`
// form as well as Illustrator's `0,0 20,0` form.
export function parseSvgPointList(value: string): [number, number][] {
  const values = value.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/gi)?.map(Number) ?? []
  const out: [number, number][] = []
  for (let i = 0; i + 1 < values.length; i += 2) {
    if (Number.isFinite(values[i]) && Number.isFinite(values[i + 1])) out.push([values[i], values[i + 1]])
  }
  return out
}

export function parseSvgToProfiles(text: string): { profiles: ImpProfile[]; note: string; skipped: string[] } {
  let doc: Document
  try { doc = new DOMParser().parseFromString(text, 'image/svg+xml') } catch { return { profiles: [], note: '唔系有效 SVG', skipped: [] } }
  const root = doc.querySelector('svg')
  if (!root || doc.querySelector('parsererror')) return { profiles: [], note: '唔系有效 SVG 或解析失败', skipped: [] }

  const profiles: ImpProfile[] = []
  const skipped = new Set<string>()
  const num = (el: Element, a: string) => parseFloat(el.getAttribute(a) || '')

  // Clone the whole tree into a live offscreen host so transforms resolve via getCTM().
  const host = document.createElementNS(NS, 'svg') as SVGSVGElement
  host.setAttribute('style', 'position:absolute;left:-99999px;top:0;width:1px;height:1px;overflow:hidden')
  for (const child of Array.from(root.childNodes)) host.appendChild(document.importNode(child, true))
  document.body.appendChild(host)

  // Element-local point → SVG user space (transform chain baked in), then Y-flipped for CAD.
  const ctmPt = (el: SVGGraphicsElement, x: number, y: number): [number, number] => {
    const m = el.getCTM()
    if (!m) return [x, -y]
    return [m.a * x + m.c * y + m.e, -(m.b * x + m.d * y + m.f)]
  }
  const scaleOf = (el: SVGGraphicsElement) => { const m = el.getCTM(); return m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) : 1 }

  try {
    host.querySelectorAll('path').forEach((el) => {
      const d = el.getAttribute('d') || ''
      for (const sub of d.split(/(?=[Mm])/)) {
        if (!sub.trim()) continue
        const p = document.createElementNS(NS, 'path') as SVGPathElement
        p.setAttribute('d', sub); el.parentNode?.appendChild(p) // sibling → same transform context
        let len = 0; try { len = p.getTotalLength() } catch { p.remove(); continue }
        if (len < 0.5) { p.remove(); continue }
        const n = Math.max(3, Math.ceil(len / 1.5))
        const pts: [number, number][] = []
        for (let i = 0; i <= n; i++) { const q = p.getPointAtLength((len * i) / n); pts.push(ctmPt(p as unknown as SVGGraphicsElement, q.x, q.y)) }
        p.remove()
        if (pts.length >= 3) profiles.push({ kind: 'poly', pts })
      }
    })
    host.querySelectorAll('circle').forEach((el) => { const r = num(el, 'r') * scaleOf(el as unknown as SVGGraphicsElement); if (r > 0) { const c = ctmPt(el as unknown as SVGGraphicsElement, num(el, 'cx') || 0, num(el, 'cy') || 0); profiles.push({ kind: 'circle', c, r }) } })
    host.querySelectorAll('rect').forEach((el) => {
      const x = num(el, 'x') || 0, y = num(el, 'y') || 0, w = num(el, 'width'), h = num(el, 'height')
      const g = el as unknown as SVGGraphicsElement
      if (w > 0 && h > 0) profiles.push({ kind: 'poly', pts: [ctmPt(g, x, y), ctmPt(g, x + w, y), ctmPt(g, x + w, y + h), ctmPt(g, x, y + h)] })
    })
    host.querySelectorAll('ellipse').forEach((el) => {
      const g = el as unknown as SVGGraphicsElement
      const rx = num(el, 'rx'), ry = num(el, 'ry')
      if (!(rx > 0 && ry > 0)) return
      // Non-uniform transforms turn a circle into an ellipse; retain a stable,
      // editable polyline rather than incorrectly treating it as a circle.
      const cx = num(el, 'cx') || 0, cy = num(el, 'cy') || 0
      const pts: [number, number][] = []
      for (let i = 0; i < 48; i++) {
        const a = (i * Math.PI * 2) / 48
        pts.push(ctmPt(g, cx + rx * Math.cos(a), cy + ry * Math.sin(a)))
      }
      profiles.push({ kind: 'poly', pts })
    })
    host.querySelectorAll('polygon,polyline').forEach((el) => {
      const g = el as unknown as SVGGraphicsElement
      const pts = parseSvgPointList(el.getAttribute('points') || '').map(([x, y]) => ctmPt(g, x, y))
      if (pts.length >= 3) profiles.push({ kind: 'poly', pts })
    })
  } finally { host.remove() }

  for (const t of ['text', 'image', 'use']) if (root.querySelector(t)) skipped.add(t)
  const note = profiles.length ? `识别 ${profiles.length} 个轮廓` : '未找到可用轮廓（支持 path / rect / circle / polygon）'
  return { profiles, note, skipped: [...skipped] }
}
