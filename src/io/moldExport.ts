// 模流导出（零新依赖）：
//  ① 充填动画 GIF —— 自写 GIF89a + LZW 编码器（业界标准 fill-time 俯视进程图）。
//  ② PDF 报告 —— 自写最小 PDF（单页 = 一张 JPEG），避开 CJK 字体嵌入：整页报告由浏览器 canvas
//     渲染（中文用系统字体）后嵌成 JPEG，故唔使 embed 字体、中文完美、含热图。
//  ③ 注塑机吨位建议 —— 锁模力 kN → 标准机台吨位查表。
// 本模块只放【纯函数】（无 DOM）：投影 / 编码 / 查表 —— 方便 Node 单元测试。
// canvas 绘制（GIF 逐帧、PDF 报告页）喺 store.ts action 做（浏览器先有 canvas）。

import type { MoldResult } from '../analysis/moldflow'

// ---- Turbo 感知均匀配色（同 Viewport feaColor 一致；返回 0..255） ----
export function turbo(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t))
  const r = 0.13572138 + x * (4.61539260 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))))
  const g = 0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))))
  const b = 0.10667330 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))))
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
  return [cl(r), cl(g), cl(b)]
}

// ---- 注塑机吨位建议：锁模力 kN → 标准机台公吨（含安全裕度，向上取标准档） ----
const MACHINE_TONNES = [30, 50, 80, 100, 120, 160, 200, 250, 320, 400, 500, 650, 800, 1000, 1300, 1600, 2000, 2500, 3200]
export function machineTonnage(clampForceKN: number, marginPct = 15): { requiredTonne: number; recommendTonne: number; marginPct: number; overRange: boolean } | null {
  if (!(clampForceKN > 0)) return null
  const reqTf = clampForceKN / 9.80665                 // kN → 公吨力（tonne-force）
  const withMargin = reqTf * (1 + marginPct / 100)
  let rec = MACHINE_TONNES[MACHINE_TONNES.length - 1]
  for (const m of MACHINE_TONNES) { if (m >= withMargin) { rec = m; break } }
  // GM-L2 #42/#88：超出标准最大档时唔好静默封顶 —— 出 overRange 旗畀调用方诚实标注
  return { requiredTonne: reqTf, recommendTonne: rec, marginPct, overRange: withMargin > MACHINE_TONNES[MACHINE_TONNES.length - 1] }
}

// ---- 2D 投影：由稀疏 centers+fill 投到「最大两轴」平面，每格取【最早到达】fill（= 充填前沿） ----
export interface FillRaster {
  cw: number; ch: number
  uAxis: 0 | 1 | 2; vAxis: 0 | 1 | 2; dropAxis: 0 | 1 | 2
  cellFill: Float32Array        // 每格最早 fill（s）；NaN = 该格无实体
  cellPress: Float32Array       // 每格最大 pressure（0..1）
  cellWeld: Uint8Array          // 1 = 该格含焊接线
  cellAir: Uint8Array           // 1 = 该格含困气/最后充填
  cellSink: Float32Array        // 每格最大缩痕趋势（0..1）
  maxFill: number
  gateCells: number[]           // 浇口落格 index（cu + cw*cv）
}
export function projectFillRaster(res: MoldResult): FillRaster {
  const c = res.centers, fill = res.fill, n = res.nVox, h = res.h > 0 ? res.h : 1
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let e = 0; e < n; e++) { for (let a = 0; a < 3; a++) { const v = c[e * 3 + a]; if (v < mn[a]) mn[a] = v; if (v > mx[a]) mx[a] = v } }
  const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
  // 丢最薄轴 → 睇最大面（最有信息量的「footprint」，同 Moldflow 出图惯例一致）
  let drop: 0 | 1 | 2 = 2
  if (ext[0] <= ext[1] && ext[0] <= ext[2]) drop = 0
  else if (ext[1] <= ext[0] && ext[1] <= ext[2]) drop = 1
  else drop = 2
  const others = ([0, 1, 2] as (0 | 1 | 2)[]).filter((a) => a !== drop)
  let uAxis = others[0], vAxis = others[1]
  if (ext[uAxis] < ext[vAxis]) { const t = uAxis; uAxis = vAxis; vAxis = t }   // u = 较大 extent（横向）
  const cw = Math.max(1, Math.round(ext[uAxis] / h) + 1)
  const ch = Math.max(1, Math.round(ext[vAxis] / h) + 1)
  const cellFill = new Float32Array(cw * ch).fill(NaN)
  const cellPress = new Float32Array(cw * ch)
  const cellWeld = new Uint8Array(cw * ch)
  const cellAir = new Uint8Array(cw * ch)
  const cellSink = new Float32Array(cw * ch)
  let maxFill = 0
  for (let e = 0; e < n; e++) {
    const cu = Math.round((c[e * 3 + uAxis] - mn[uAxis]) / h)
    const cv = Math.round((c[e * 3 + vAxis] - mn[vAxis]) / h)
    if (cu < 0 || cu >= cw || cv < 0 || cv >= ch) continue
    const idx = cu + cw * cv
    const f = fill[e]
    if (Number.isNaN(cellFill[idx]) || f < cellFill[idx]) cellFill[idx] = f
    if (res.pressure[e] > cellPress[idx]) cellPress[idx] = res.pressure[e]
    if (res.weld[e]) cellWeld[idx] = 1
    if (res.airtrap[e]) cellAir[idx] = 1
    if (res.sinkMark[e] > cellSink[idx]) cellSink[idx] = res.sinkMark[e]
    if (f > maxFill) maxFill = f
  }
  const gateCells: number[] = []
  for (const g of res.gateIdx) {
    if (g < 0 || g >= n) continue
    const cu = Math.round((c[g * 3 + uAxis] - mn[uAxis]) / h)
    const cv = Math.round((c[g * 3 + vAxis] - mn[vAxis]) / h)
    if (cu >= 0 && cu < cw && cv >= 0 && cv < ch) gateCells.push(cu + cw * cv)
  }
  return { cw, ch, uAxis, vAxis, dropAxis: drop, cellFill, cellPress, cellWeld, cellAir, cellSink, maxFill, gateCells }
}

// ---- GIF89a 动画编码（自写 LZW；零依赖） ----
// frames: 每帧 RGBA（length = w*h*4）。palette: ≤256 个 [r,g,b]（自动补到 256）。用 15-bit 缓存最近色量化。
export function encodeGif(
  frames: ArrayLike<number>[],
  w: number,
  h: number,
  palette: [number, number, number][],
  opt?: { delayCs?: number; lastHoldCs?: number },
): Uint8Array {
  const delay = opt?.delayCs ?? 8
  const hold = opt?.lastHoldCs ?? 140
  // palette → 256×3
  const gct = new Uint8Array(256 * 3)
  for (let i = 0; i < 256; i++) { const p = palette[Math.min(i, palette.length - 1)] || [0, 0, 0]; gct[i * 3] = p[0]; gct[i * 3 + 1] = p[1]; gct[i * 3 + 2] = p[2] }
  // 15-bit（每通道 5 位）最近色缓存
  const cache = new Int16Array(32768).fill(-1)
  const nearest = (r: number, g: number, b: number): number => {
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
    const cv = cache[key]; if (cv >= 0) return cv
    let best = 0, bd = 1e9
    for (let i = 0; i < 256; i++) { const dr = r - gct[i * 3], dg = g - gct[i * 3 + 1], db = b - gct[i * 3 + 2]; const d = dr * dr + dg * dg + db * db; if (d < bd) { bd = d; best = i; if (d === 0) break } }
    cache[key] = best; return best
  }
  const out: number[] = []
  const putStr = (s: string) => { for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff) }
  const le16 = (v: number) => { out.push(v & 0xff, (v >> 8) & 0xff) }
  putStr('GIF89a')
  le16(w); le16(h)
  out.push(0xf7, 0x00, 0x00)        // GCT flag=1, colorRes=7, sort=0, size=7(→256) ; bg idx 0 ; aspect 0
  for (let i = 0; i < 256 * 3; i++) out.push(gct[i])
  // Netscape 循环（无限）
  out.push(0x21, 0xff, 0x0b); putStr('NETSCAPE2.0'); out.push(0x03, 0x01, 0x00, 0x00, 0x00)
  const MIN = 8                     // 256 色 → minCodeSize 8
  for (let fi = 0; fi < frames.length; fi++) {
    const rgba = frames[fi]
    const idx = new Uint8Array(w * h)
    for (let p = 0; p < w * h; p++) idx[p] = nearest(rgba[p * 4] as number, rgba[p * 4 + 1] as number, rgba[p * 4 + 2] as number)
    const d = (fi === frames.length - 1) ? hold : delay
    out.push(0x21, 0xf9, 0x04, 0x00, d & 0xff, (d >> 8) & 0xff, 0x00, 0x00)   // GCE：无 disposal / 无透明
    out.push(0x2c); le16(0); le16(0); le16(w); le16(h); out.push(0x00)        // image descriptor
    out.push(MIN)
    const lzw = lzwEncode(idx, MIN)
    for (let i = 0; i < lzw.length;) { const chunk = Math.min(255, lzw.length - i); out.push(chunk); for (let j = 0; j < chunk; j++) out.push(lzw[i + j]); i += chunk }
    out.push(0x00)                  // block terminator
  }
  out.push(0x3b)                    // trailer
  return Uint8Array.from(out)
}

// GIF LZW —— 用「无压缩 / minimal GIF」技法（LSB-first，codeSize 固定 = minCodeSize+1）：
//   每 (clear-2) 个字面码前插一个 Clear，令解码器字典永远到唔到 2^codeSize → 完全无 size-growth →
//   零 off-by-one 风险（标准做法，任何合规解码器/浏览器都解到）。代价系唔压缩、文件略大（用细帧数/小尺寸补返）。
function lzwEncode(indices: Uint8Array, minCodeSize: number): number[] {
  const clear = 1 << minCodeSize
  const eoi = clear + 1
  const codeSize = minCodeSize + 1
  const RESET_EVERY = clear - 2          // 256 色 → 每 254 个字面码 reset 一次（解码器 next 永唔达 512）
  const bytes: number[] = []
  let cur = 0, nb = 0
  const emit = (code: number) => { cur |= code << nb; nb += codeSize; while (nb >= 8) { bytes.push(cur & 0xff); cur >>= 8; nb -= 8 } }
  emit(clear)
  let since = 0
  for (let i = 0; i < indices.length; i++) {
    emit(indices[i])
    if (++since >= RESET_EVERY) { emit(clear); since = 0 }
  }
  emit(eoi)
  if (nb > 0) bytes.push(cur & 0xff)
  return bytes
}

// ---- 最小 PDF：每页 = 一张全页 JPEG（DCTDecode）。文本/中文/热图都已烘焙入 JPEG，故无字体嵌入。 ----
export function buildImagePdf(images: { jpeg: Uint8Array; w: number; h: number }[], opt?: { pageWpt?: number; pageHpt?: number }): Uint8Array {
  const pageW = opt?.pageWpt ?? 595.28      // A4 portrait pt
  const pageH = opt?.pageHpt ?? 841.89
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  let len = 0
  const out = (d: Uint8Array | string) => { const u = typeof d === 'string' ? enc.encode(d) : d; parts.push(u); len += u.length }
  const offsets: number[] = []
  const beginObj = (n: number) => { offsets[n] = len; out(`${n} 0 obj\n`) }
  out(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))   // %PDF-1.4 + 二进制标记
  const N = images.length
  beginObj(1); out('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  const kids: string[] = []
  for (let i = 0; i < N; i++) kids.push(`${3 + i * 3} 0 R`)
  beginObj(2); out(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${N} >>\nendobj\n`)
  for (let i = 0; i < N; i++) {
    const img = images[i]
    const pageN = 3 + i * 3, contentN = 4 + i * 3, imgN = 5 + i * 3
    const scale = Math.min((pageW - 40) / img.w, (pageH - 40) / img.h)
    const dw = img.w * scale, dh = img.h * scale
    const x = (pageW - dw) / 2, y = (pageH - dh) / 2
    const content = `q\n${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`
    beginObj(pageN); out(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] /Resources << /XObject << /Im0 ${imgN} 0 R >> >> /Contents ${contentN} 0 R >>\nendobj\n`)
    beginObj(contentN); out(`<< /Length ${enc.encode(content).length} >>\nstream\n`); out(content); out('endstream\nendobj\n')
    beginObj(imgN); out(`<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`); out(img.jpeg); out('\nendstream\nendobj\n')
  }
  const xrefStart = len
  const maxObj = 2 + N * 3
  out(`xref\n0 ${maxObj + 1}\n`)
  out('0000000000 65535 f \n')
  for (let n = 1; n <= maxObj; n++) { const o = offsets[n] ?? 0; out(`${String(o).padStart(10, '0')} 00000 n \n`) }
  out(`trailer\n<< /Size ${maxObj + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`)
  const buf = new Uint8Array(len); let p = 0; for (const u of parts) { buf.set(u, p); p += u.length }
  return buf
}
