import type { MeshData } from '../worker/cad.worker'

// ASCII STL writer (one mesh, Z-up mm). Some older slicers / CAM / debugging prefer ASCII over binary.
// Face normal recomputed from the triangle winding. Returns a UTF-8 string.
export function meshToAsciiSTL(mesh: MeshData, name = 'webcad'): string {
  const v = mesh.vertices, t = mesh.triangles
  const lines: string[] = [`solid ${name}`]
  // 7 significant digits, trailing zeros trimmed. toPrecision switches to exponential for |x|≥1e7 (which some
  // STL parsers reject); that's unreachable for real mm models (beds are sub-metre) but guard it anyway —
  // fall back to fixed notation. Normal coords never contain 'e', so their output is byte-identical.
  const f = (x: number) => {
    if (!Number.isFinite(x)) return '0'   // bt3: NaN/Infinity → '0'（否则 toPrecision 写出 "NaN" 破坏 ASCII STL,切片器拒解析）
    const v = Math.abs(x) < 1e-7 ? 0 : x
    const s = v.toPrecision(7)
    const out = /e/i.test(s) ? v.toFixed(3) : s
    // GM-L2 #85：只喺串含小数点先剔尾零。≥1e6 嘅整数坐标（如 '1000000'）toPrecision 出唔带小数点，
    // 贪婪剔尾零会将 '1000000' 变 '1'（坐标全错）。toFixed 路径必带 '.'，故 trim 后 byte 不变。
    return (out.includes('.') ? out.replace(/\.?0+$/, '') : out) || '0'
  }
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    if (![a, b, c].every((k) => Number.isInteger(k) && k >= 0 && k + 2 < v.length) ||
      ![v[a], v[a + 1], v[a + 2], v[b], v[b + 1], v[b + 2], v[c], v[c + 1], v[c + 2]].every(Number.isFinite)) continue
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2]
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2]
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L
    lines.push(`  facet normal ${f(nx)} ${f(ny)} ${f(nz)}`, '    outer loop',
      `      vertex ${f(v[a])} ${f(v[a + 1])} ${f(v[a + 2])}`,
      `      vertex ${f(v[b])} ${f(v[b + 1])} ${f(v[b + 2])}`,
      `      vertex ${f(v[c])} ${f(v[c + 1])} ${f(v[c + 2])}`,
      '    endloop', '  endfacet')
  }
  lines.push(`endsolid ${name}`)
  return lines.join('\n') + '\n'
}

// Self-contained STL parser (binary + ASCII). STL is Z-up mm, matching our CAD
// convention, so vertices map straight into MeshData (KernelBody rotates Z-up→Y-up).
export function parseSTL(buf: ArrayBuffer): MeshData {
  const dv = new DataView(buf)
  if (buf.byteLength >= 84) {
    const n = dv.getUint32(80, true)
    // Binary STL = 84-byte header + 50·n. Strict `=== byteLength` (old) mis-classified binaries carrying
    // trailing padding/metadata (byteLength > 84+50n) as ASCII → the text parser then produced a garbage/
    // empty mesh. Accept binary whenever the declared face count FITS the buffer (`<=`). A real ASCII file
    // cannot be caught here: its offset-80 u32 is text bytes (each ≥0x0a) → n is in the hundreds of
    // millions, so 84+50n vastly exceeds byteLength and it correctly falls through to parseAscii below.
    if (n > 0 && 84 + n * 50 <= buf.byteLength) return parseBinary(dv, n)
  }
  return parseAscii(new TextDecoder().decode(buf))
}

function parseBinary(dv: DataView, n: number): MeshData {
  // A large binary STL has exactly three independent vertices per face.  Reserve
  // the final sizes up front: repeated `push` growth creates several transient
  // backing arrays for a 500k+ face import, which is visible as avoidable GC
  // pauses even though parsing itself is now performed in mesh.worker.
  const vertices = new Array<number>(n * 9)
  const normals = new Array<number>(n * 9)
  const triangles = new Array<number>(n * 3)
  let o = 84, vo = 0, to = 0
  for (let i = 0; i < n; i++) {
    const nx = dv.getFloat32(o, true), ny = dv.getFloat32(o + 4, true), nz = dv.getFloat32(o + 8, true)
    o += 12
    const xyz = new Array<number>(9)
    for (let v = 0; v < 3; v++) {
      const k = v * 3
      xyz[k] = dv.getFloat32(o, true)
      xyz[k + 1] = dv.getFloat32(o + 4, true)
      xyz[k + 2] = dv.getFloat32(o + 8, true)
      o += 12
    }
    o += 2 // attribute byte count
    // A single NaN/Infinity poisons bounds, ray casts and later exports. Drop
    // the malformed facet rather than retaining it in a long-lived mesh.
    if (!xyz.every(Number.isFinite)) continue
    const normal = [nx, ny, nz].every(Number.isFinite) ? [nx, ny, nz] : [0, 0, 1]
    for (let k = 0; k < 9; k++) { vertices[vo + k] = xyz[k]; normals[vo + k] = normal[k % 3] }
    const base = vo / 3
    triangles[to] = base; triangles[to + 1] = base + 1; triangles[to + 2] = base + 2
    vo += 9; to += 3
  }
  vertices.length = vo; normals.length = vo; triangles.length = to
  return { vertices, normals, triangles }
}

// Merge several meshes (each with a column-major 4x4 transform, three.js order)
// into one binary STL. Face normals are recomputed from the transformed vertices.
export function meshesToBinarySTL(parts: { mesh: MeshData; matrix: number[] }[]): ArrayBuffer {
  // Exporters are also a trust boundary: imported/edited meshes may carry a
  // stale index or non-finite vertex after a failed operation.  Count only
  // triangles that can really be serialized, otherwise the STL header claims
  // faces that contain NaN coordinates (many slicers reject the whole file).
  const valid = (p: { mesh: MeshData; matrix: number[] }, i: number) => {
    const v = p.mesh.vertices, t = p.mesh.triangles
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    return p.matrix.length >= 16 && [a, b, c].every((k) => Number.isInteger(k) && k >= 0 && k + 2 < v.length) &&
      [v[a], v[a + 1], v[a + 2], v[b], v[b + 1], v[b + 2], v[c], v[c + 1], v[c + 2], ...p.matrix.slice(0, 16)].every(Number.isFinite)
  }
  let n = 0
  for (const p of parts) for (let i = 0; i + 2 < p.mesh.triangles.length; i += 3) if (valid(p, i)) n++
  const buf = new ArrayBuffer(84 + n * 50)
  const dv = new DataView(buf)
  dv.setUint32(80, n, true)
  let o = 84
  const ap = (e: number[], x: number, y: number, z: number): [number, number, number] => [
    e[0] * x + e[4] * y + e[8] * z + e[12],
    e[1] * x + e[5] * y + e[9] * z + e[13],
    e[2] * x + e[6] * y + e[10] * z + e[14],
  ]
  for (const p of parts) {
    const v = p.mesh.vertices, t = p.mesh.triangles, e = p.matrix
    for (let i = 0; i < t.length; i += 3) {
      if (!valid(p, i)) continue
      const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
      const p0 = ap(e, v[a], v[a + 1], v[a + 2]), p1 = ap(e, v[b], v[b + 1], v[b + 2]), p2 = ap(e, v[c], v[c + 1], v[c + 2])
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2]
      const wx = p2[0] - p0[0], wy = p2[1] - p0[1], wz = p2[2] - p0[2]
      let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx
      const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L
      dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true); o += 12
      for (const pp of [p0, p1, p2]) { dv.setFloat32(o, pp[0], true); dv.setFloat32(o + 4, pp[1], true); dv.setFloat32(o + 8, pp[2], true); o += 12 }
      dv.setUint16(o, 0, true); o += 2
    }
  }
  return buf
}

function parseAscii(s: string): MeshData {
  const vertices: number[] = [], normals: number[] = [], triangles: number[] = []
  const nums = (line: string) => line.trim().split(/\s+/).slice(-3).map(Number)
  let cur: [number, number, number] = [0, 0, 1]
  // Keep a facet-local list rather than accepting every `vertex` line globally.
  // Malformed ASCII STL files are common in the wild; allowing NaN/Infinity or a
  // partial facet through poisons bounds, rendering and subsequent exports.
  let facet: number[] = []
  const flushFacet = () => {
    if (facet.length !== 9) { facet = []; return }
    const base = vertices.length / 3
    vertices.push(...facet)
    normals.push(cur[0], cur[1], cur[2], cur[0], cur[1], cur[2], cur[0], cur[1], cur[2])
    triangles.push(base, base + 1, base + 2)
    facet = []
  }
  for (const raw of s.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('facet normal')) {
      // Starting a new facet discards a previous incomplete one.
      facet = []
      const n = nums(line)
      cur = n.every(Number.isFinite) ? n as [number, number, number] : [0, 0, 1]
    }
    else if (line.startsWith('vertex')) {
      const [x, y, z] = nums(line)
      if ([x, y, z].every(Number.isFinite)) facet.push(x, y, z)
    } else if (line.startsWith('endfacet')) flushFacet()
  }
  // Some exporters omit endfacet; retain their complete final facet, but never a
  // partial one.
  flushFacet()
  return { vertices, normals, triangles }
}
