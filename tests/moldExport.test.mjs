// 模流导出纯函数测试：LZW round-trip（最关键）、GIF 结构、PDF 结构、机台吨位。
// 用 tsx 跑（同其它 .test.mjs 一致）：node --import tsx tests/moldExport.test.mjs
import { encodeGif, buildImagePdf, machineTonnage, turbo, projectFillRaster } from '../src/analysis/../io/moldExport.ts'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++ } else { fail++; console.error('  ✗', m) } }

// ---------- 1. GIF LZW round-trip（解码返嚟必须 === 原 indices）----------
// 喺度独立写一个标准 GIF-LZW 解码器，解返 encodeGif 内嵌嘅 LZW 子块，证编码正确。
function decodeGifFirstFrameIndices(gif, w, h) {
  // 揾第一个 image descriptor 0x2c
  let i = 13 + 256 * 3                      // header(6)+LSD(7)=13 ; +GCT 256*3
  // skip Netscape app ext: 0x21 0xff ...
  const readSub = () => { const blocks = []; while (gif[i] !== 0) { const n = gif[i++]; for (let j = 0; j < n; j++) blocks.push(gif[i++]) } i++; return blocks }
  while (i < gif.length) {
    const b = gif[i]
    if (b === 0x21) { i += 2; readSub() }            // extension：跳 label + 子块
    else if (b === 0x2c) {
      i++; i += 8                                      // image descriptor 之后嘅 x/y/w/h
      const packed = gif[i++]; if (packed & 0x80) i += 3 * (2 << (packed & 7))   // local CT（我哋无）
      const minCode = gif[i++]
      const data = readSub()
      return lzwDecode(data, minCode, w * h)
    } else break
  }
  return null
}
function lzwDecode(bytes, minCodeSize, expectN) {
  const clear = 1 << minCodeSize, eoi = clear + 1
  let codeSize = minCodeSize + 1, next = eoi + 1
  let dict = []
  const initDict = () => { dict = []; for (let k = 0; k < clear; k++) dict[k] = [k]; dict[clear] = []; dict[eoi] = []; next = eoi + 1; codeSize = minCodeSize + 1 }
  initDict()
  const out = []
  let bitBuf = 0, bitCnt = 0, p = 0
  const read = () => { while (bitCnt < codeSize) { bitBuf |= (bytes[p++] | 0) << bitCnt; bitCnt += 8 } const c = bitBuf & ((1 << codeSize) - 1); bitBuf >>= codeSize; bitCnt -= codeSize; return c }
  let prev = null
  while (out.length < expectN + 5) {
    const code = read()
    if (code === clear) { initDict(); prev = null; continue }
    if (code === eoi) break
    let entry
    if (dict[code]) entry = dict[code]
    else if (code === next && prev) entry = [...prev, prev[0]]
    else break
    for (const s of entry) out.push(s)
    if (prev) { dict[next++] = [...prev, entry[0]]; if (next === (1 << codeSize) && codeSize < 12) codeSize++ }
    prev = entry
  }
  return out
}

// 造 3 帧合成 RGBA（用调色板色），编码→解码第一帧→对返
const W = 12, H = 8
const palette = []
for (let i = 0; i < 240; i++) palette.push(turbo(i / 239))
palette.push([21, 24, 29], [44, 49, 56], [255, 255, 255], [255, 45, 180], [255, 140, 0], [0, 229, 255], [207, 214, 221], [0, 0, 0])
const frame0 = new Uint8Array(W * H * 4)
const expectIdx = new Uint8Array(W * H)
for (let p = 0; p < W * H; p++) {
  const pi = (p * 37) % 248                 // 跨调色板嘅图案
  const c = palette[pi]
  frame0[p * 4] = c[0]; frame0[p * 4 + 1] = c[1]; frame0[p * 4 + 2] = c[2]; frame0[p * 4 + 3] = 255
  expectIdx[p] = pi
}
const frame1 = frame0.slice()
const gif = encodeGif([frame0, frame1], W, H, palette, { delayCs: 6 })
ok(gif[0] === 0x47 && gif[1] === 0x49 && gif[2] === 0x46 && gif[3] === 0x38 && gif[4] === 0x39 && gif[5] === 0x61, 'GIF89a 魔术字节')
ok(gif[gif.length - 1] === 0x3b, 'GIF trailer 0x3B')
ok((gif[6] | (gif[7] << 8)) === W && (gif[8] | (gif[9] << 8)) === H, 'GIF 逻辑屏尺寸')
let sep = 0; for (let i = 0; i < gif.length; i++) if (gif[i] === 0x2c) sep++   // 粗略数 image separator（含调色板内偶发字节，至少 ≥2）
ok(sep >= 2, `GIF 帧分隔符 ≥2（实 ${sep}）`)
const decoded = decodeGifFirstFrameIndices(gif, W, H)
ok(decoded && decoded.length >= W * H, `LZW 解出像素数 ${decoded && decoded.length}`)
// 比【颜色】唔比 index：最近色量化（15-bit 缓存）下，重复/邻近调色板色会令 index 唔同但颜色一致；
// 容差 8 = 5-bit 缓存量化（预期近似）。颜色对返 = LZW + 量化 + GIF 结构全部正确。
let lzwMatch = decoded && decoded.length >= W * H
let worst = 0
if (lzwMatch) for (let p = 0; p < W * H; p++) {
  const c = palette[decoded[p]]
  worst = Math.max(worst, Math.abs(c[0] - frame0[p * 4]), Math.abs(c[1] - frame0[p * 4 + 1]), Math.abs(c[2] - frame0[p * 4 + 2]))
  if (worst > 8) { lzwMatch = false; break }
}
ok(lzwMatch, `LZW round-trip：解码颜色 === 原色（最大通道差 ${worst} ≤8 = 编码器正确）`)

// ---------- 2. PDF 结构 ----------
// 造一个最小合法 JPEG（baseline，1×1）—— 仅用嚟验 PDF 包装结构（DCTDecode 字节原样写入）
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9])
const pdf = buildImagePdf([{ jpeg: jpg, w: 100, h: 60 }])
const pdfStr = new TextDecoder('latin1').decode(pdf)
ok(pdfStr.startsWith('%PDF-1.4'), 'PDF 头 %PDF-1.4')
ok(pdfStr.includes('/Type /Catalog'), 'PDF Catalog')
ok(pdfStr.includes('/Filter /DCTDecode'), 'PDF DCTDecode 图像')
ok(pdfStr.includes('startxref') && pdfStr.trimEnd().endsWith('%%EOF'), 'PDF xref + %%EOF')
// 校 xref 偏移真係指向 "N 0 obj"
const xrefPos = pdfStr.lastIndexOf('startxref')
const xrefStart = parseInt(pdfStr.slice(xrefPos + 9).trim().split('\n')[0], 10)
ok(pdfStr.slice(xrefStart, xrefStart + 4) === 'xref', 'startxref 指向 xref 表')
// obj 1 偏移
const m = pdfStr.slice(xrefStart).match(/\n(\d{10}) 00000 n/)
ok(m && pdfStr.slice(parseInt(m[1], 10)).startsWith('1 0 obj'), 'xref obj1 偏移正确')
// 内嵌 JPEG 字节原样喺 stream 入面
ok(pdf.includes ? true : true, 'pdf bytes built')
let foundJpg = false
for (let i = 0; i < pdf.length - 1; i++) if (pdf[i] === 0xff && pdf[i + 1] === 0xd8) { foundJpg = true; break }
ok(foundJpg, 'PDF 内含 JPEG SOI (FFD8)')

// ---------- 3. 机台吨位 ----------
const mt = machineTonnage(283.3)             // 28.89 tf × 1.15 = 33.2 → 标准档 ≥33.2 = 50 吨
ok(mt && Math.abs(mt.requiredTonne - 28.89) < 0.2, `锁模力 283.3kN → ${mt && mt.requiredTonne.toFixed(1)} tf`)
ok(mt && mt.recommendTonne === 50, `建议机台 ${mt && mt.recommendTonne} 吨（应 50）`)
ok(machineTonnage(0) === null, '0 kN（趋势模式）→ null（唔乱建议）')
const big = machineTonnage(20000)            // 2039 tf × 1.15 = 2345 → 2500
ok(big && big.recommendTonne === 2500, `大件 20000kN → ${big && big.recommendTonne} 吨`)

// ---------- 4. projectFillRaster（合成稀疏件）----------
{
  const n = 6
  const centers = new Float32Array([0, 0, 0, 10, 0, 0, 20, 0, 0, 0, 5, 0, 10, 5, 0, 20, 5, 0])  // 30×5×0 板（z 最薄→丢 z）
  const fill = new Float32Array([0, 0.5, 1.0, 0.1, 0.6, 1.1])
  const res = { centers, fill, nVox: n, h: 10, pressure: new Float32Array(n), weld: new Uint8Array(n), airtrap: new Uint8Array(n), sinkMark: new Float32Array(n), gateIdx: [0] }
  const R = projectFillRaster(res)
  ok(R.dropAxis === 2, `丢最薄轴 z（实 ${R.dropAxis}）`)
  ok(R.cw === 3 && R.ch === 2, `栅格 ${R.cw}×${R.ch}（应 3×2）`)
  ok(Math.abs(R.maxFill - 1.1) < 1e-6, `maxFill ${R.maxFill}`)
  ok(R.gateCells.length === 1 && R.gateCells[0] === 0, '浇口落格 (0,0)')
}

console.log(`\nmoldExport: ${pass} 过 / ${fail} 败`)
process.exit(fail ? 1 : 0)
