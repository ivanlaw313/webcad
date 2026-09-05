// T790（S69）：G-code 刀路回放预览 — 激光 + CNC 共用嘅 canvas 顶视图。
// 解析 G0/G1/G2/G3（模态坐标 + I/J 圆心偏移），快移虚线灰、切削按 Z 深度着色（浅→深 = 蓝→红），
// 圆弧密铺 24 段。出咗 G-code 唔使拖去 ncviewer 先敢落机 — 信任闭环。
import { useEffect, useRef } from 'react'
import { useApp } from '../store'

type Seg = { x1: number; y1: number; x2: number; y2: number; z: number; rapid: boolean }

// 简易 GRBL 解析：模态 G 字 + X/Y/Z/I/J；G2(顺)/G3(逆) 用 I/J（圆心相对起点）密铺。
function parseGcode(g: string): { segs: Seg[]; zMin: number; cutLen: number } {
  const segs: Seg[] = []
  let x = 0, y = 0, z = 0, mode = 0, zMin = 0, cutLen = 0
  for (const raw of g.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('(') || line.startsWith(';')) continue
    const gm = /^G([0123])\b/.exec(line)
    if (gm) mode = Number(gm[1])
    else if (!/[XYZIJ]/.test(line)) continue   // M3/M5/G21… 冇坐标
    const num = (k: string): number | null => { const m = new RegExp(k + '(-?[\\d.]+)').exec(line); return m ? Number(m[1]) : null }
    const nx = num('X') ?? x, ny = num('Y') ?? y, nz = num('Z') ?? z
    if (mode <= 1) {
      if (nx !== x || ny !== y || nz !== z) {
        segs.push({ x1: x, y1: y, x2: nx, y2: ny, z: Math.min(z, nz), rapid: mode === 0 })
        if (mode === 1 && (nx !== x || ny !== y)) cutLen += Math.hypot(nx - x, ny - y)
      }
      x = nx; y = ny; z = nz
    } else {
      const i = num('I') ?? 0, j = num('J') ?? 0
      const cx = x + i, cy = y + j, r = Math.hypot(i, j)
      let a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx)
      if (mode === 2) { if (a1 >= a0 - 1e-9) a1 -= 2 * Math.PI } else { if (a1 <= a0 + 1e-9) a1 += 2 * Math.PI }
      const N = 24
      let px = x, py = y
      for (let k = 1; k <= N; k++) {
        const a = a0 + (a1 - a0) * (k / N)
        const qx = cx + r * Math.cos(a), qy = cy + r * Math.sin(a)
        segs.push({ x1: px, y1: py, x2: qx, y2: qy, z: nz, rapid: false })
        px = qx; py = qy
      }
      cutLen += Math.abs(a1 - a0) * r
      x = nx; y = ny; z = nz
    }
    if (z < zMin) zMin = z
  }
  return { segs, zMin, cutLen }
}

export default function GcodeBackplot() {
  const pv = useApp((s) => s.gcodePreview)
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!pv || !ref.current) return
    const { segs, zMin } = parseGcode(pv.gcode)
    const cv = ref.current, g2 = cv.getContext('2d')!
    const W = cv.width, H = cv.height
    g2.clearRect(0, 0, W, H)
    if (!segs.length) return
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
    for (const s of segs) { mnx = Math.min(mnx, s.x1, s.x2); mny = Math.min(mny, s.y1, s.y2); mxx = Math.max(mxx, s.x1, s.x2); mxy = Math.max(mxy, s.y1, s.y2) }
    const pad = 24, sc = Math.min((W - 2 * pad) / Math.max(1e-6, mxx - mnx), (H - 2 * pad) / Math.max(1e-6, mxy - mny))
    const tx = (v: number) => pad + (v - mnx) * sc
    const ty = (v: number) => H - pad - (v - mny) * sc   // Y 向上
    // 原点十字
    g2.strokeStyle = '#c8d2da'; g2.lineWidth = 1; g2.setLineDash([])
    g2.beginPath(); g2.moveTo(tx(0) - 8, ty(0)); g2.lineTo(tx(0) + 8, ty(0)); g2.moveTo(tx(0), ty(0) - 8); g2.lineTo(tx(0), ty(0) + 8); g2.stroke()
    for (const s of segs) {
      if (s.rapid) { g2.strokeStyle = '#b0b8c0'; g2.setLineDash([4, 4]); g2.lineWidth = 1 }
      else {
        // 深度着色：z=0 浅蓝 → zMin 深红（多层一眼睇晒）
        const t = zMin < 0 ? Math.min(1, s.z / zMin) : 0
        g2.strokeStyle = `hsl(${210 - 200 * t}, 80%, ${45 - 12 * t}%)`; g2.setLineDash([]); g2.lineWidth = 2
      }
      g2.beginPath(); g2.moveTo(tx(s.x1), ty(s.y1)); g2.lineTo(tx(s.x2), ty(s.y2)); g2.stroke()
    }
    // 比例尺（10mm）
    g2.setLineDash([]); g2.strokeStyle = '#444'; g2.lineWidth = 2
    g2.beginPath(); g2.moveTo(pad, H - 8); g2.lineTo(pad + 10 * sc, H - 8); g2.stroke()
    g2.fillStyle = '#444'; g2.font = '11px sans-serif'; g2.fillText('10mm', pad + 10 * sc + 4, H - 5)
  }, [pv])
  if (!pv) return null
  const { cutLen, zMin } = parseGcode(pv.gcode)
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,28,36,.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => useApp.getState().closeGcodePreview()}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 14, boxShadow: '0 8px 40px rgba(0,0,0,.3)', maxWidth: '92vw' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <b style={{ fontSize: 13 }}>{pv.title}</b>
          <span style={{ fontSize: 11, color: '#5a6b78' }}>切削 {cutLen.toFixed(0)}mm{zMin < 0 ? ` · 最深 Z${zMin.toFixed(1)}` : ''} · 虚线=快移 · 颜色=深度（蓝浅红深）</span>
          <button className="cs-x" style={{ marginLeft: 'auto' }} title="关闭预览" onClick={() => useApp.getState().closeGcodePreview()}>✕</button>
        </div>
        <canvas ref={ref} width={640} height={480} style={{ border: '1px solid #dde4ea', borderRadius: 6, background: '#fafcfe' }} />
      </div>
    </div>
  )
}
