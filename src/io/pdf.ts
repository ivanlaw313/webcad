// 极简单页 PDF 1.4 写入器 —— 一页 + 一个 DCTDecode (JPEG) Image XObject，零依赖（自写，license-safe）。
// 工程图 PDF 行「位图嵌入」路线（按钮 tooltip 诚实标明）：矢量 PDF 入面嘅中文文字需要 CID 字体嵌入
// （字体子集 + cmap，体积/复杂度都唔值），所以将成张图纸喺 canvas 光栅化成 JPEG 再嵌入 A4 横向页。
// JPEG 直接用 /Filter /DCTDecode 原样嵌入 stream —— 唔使 FlateDecode，唔使任何压缩库。

export type PdfPageOpts = {
  pageW?: number // 页宽 pt（默认 842 = A4 横向）
  pageH?: number // 页高 pt（默认 595 = A4 横向）
  margin?: number // 四边留白 pt（默认 14 ≈ 5mm，打印安全边）
}

// data URL（如 canvas.toDataURL 输出）→ 字节。atob 每字符一字节，直接搬入 Uint8Array。
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(',')
  const bin = atob(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff
  return out
}

// latin1 字符串 → 字节（PDF 语法部分全 ASCII；%âãÏÓ 二进制注释行逐字节写）。
const enc = (s: string): Uint8Array => {
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff
  return u
}
const num = (n: number) => +n.toFixed(2) + '' // PDF 数字：最多 2 位小数，去尾零（toFixed→+ 还原）

// 将一张 JPEG（imgW×imgH 像素）嵌入一页 PDF：图片等比缩放适配页面（减去 margin）并居中。
// 返回完整 PDF 字节（含正确 xref 字节偏移表 + startxref）。
export function jpegToPdf(jpeg: Uint8Array, imgW: number, imgH: number, opts: PdfPageOpts = {}): Uint8Array {
  if (!(imgW > 0) || !(imgH > 0) || !jpeg.length) throw new Error('jpegToPdf: 无效图像')
  const pageW = opts.pageW ?? 842, pageH = opts.pageH ?? 595, m = opts.margin ?? 14
  // 等比适配 + 居中（pt 坐标，PDF y 向上，原点左下）
  const k = Math.min((pageW - 2 * m) / imgW, (pageH - 2 * m) / imgH)
  const sw = imgW * k, sh = imgH * k
  const tx = (pageW - sw) / 2, ty = (pageH - sh) / 2
  // 内容流：cm 矩阵 [sw 0 0 sh tx ty] 将 1×1 单位图像缩放/平移到目标矩形
  const content = `q\n${num(sw)} 0 0 ${num(sh)} ${num(tx)} ${num(ty)} cm\n/Im0 Do\nQ\n`

  const chunks: Uint8Array[] = []
  let off = 0
  const push = (b: Uint8Array | string) => { const u = typeof b === 'string' ? enc(b) : b; chunks.push(u); off += u.length }
  const offsets = [0, 0, 0, 0, 0, 0] // offsets[i] = 对象 i 嘅字节偏移（xref 用）

  push('%PDF-1.4\n%âãÏÓ\n') // 二进制标记注释（PDF 规范建议，提示传输层呢个係二进制文件）
  offsets[1] = off
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n')
  offsets[2] = off
  push('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n')
  offsets[3] = off
  push(`3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(pageW)} ${num(pageH)}] /Resources << /XObject << /Im0 4 0 R >> /ProcSet [/PDF /ImageC] >> /Contents 5 0 R >>\nendobj\n`)
  offsets[4] = off
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.round(imgW)} /Height ${Math.round(imgH)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`)
  push(jpeg)
  push('\nendstream\nendobj\n')
  offsets[5] = off
  push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}endstream\nendobj\n`)
  const xref = off
  push('xref\n0 6\n0000000000 65535 f \n' + offsets.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''))
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)

  const out = new Uint8Array(off)
  let p = 0
  for (const c of chunks) { out.set(c, p); p += c.length }
  return out
}
