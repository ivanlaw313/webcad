// GM-X1 #16：Display Mesh Face Groups（Fusion Shift+F）—— 逐网格面组循环上色。纯函数, 零依赖。
// faceGroups 已由内核供（拔模/量面共用）。此处把每个 faceId 映射到调色板一色, 生成逐顶点 color buffer
// 畀 three.js vertexColors 用。OCCT 三角化逐面独立顶点 → 逐顶点上色唔会串色。

export interface FGMesh {
  vertices: ArrayLike<number>
  triangles: ArrayLike<number>
  faceGroups?: { start: number; count: number; faceId: number }[]
}

// hex '#rrggbb' → [r,g,b] 0..1（linear-ish, 够用作 flat 区分色）。
export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// faceId → 调色板索引（稳定映射：按首次出现次序循环, 令相邻面尽量唔同色, 且同 faceId 恒同色）。
export function faceGroupPaletteIndex(mesh: FGMesh, paletteLen: number): Map<number, number> {
  const m = new Map<number, number>()
  if (!mesh.faceGroups || paletteLen <= 0) return m
  let next = 0
  for (const g of mesh.faceGroups) {
    if (!m.has(g.faceId)) { m.set(g.faceId, next % paletteLen); next++ }
  }
  return m
}

// 生成逐顶点 color Float32Array（长度 = 顶点数×3）。无 faceGroups → 返 null（导入件冇逐面身份）。
export function buildFaceGroupColors(mesh: FGMesh, palette: string[]): Float32Array | null {
  if (!mesh.faceGroups || !mesh.faceGroups.length || !palette.length) return null
  const nV = Math.floor(mesh.vertices.length / 3)
  if (nV === 0) return null
  const rgb = palette.map(hexToRgb)
  const idx = faceGroupPaletteIndex(mesh, palette.length)
  const out = new Float32Array(nV * 3)
  out.fill(0.72)   // 缺省浅灰（未被任何组覆盖嘅顶点）
  const t = mesh.triangles
  for (const g of mesh.faceGroups) {
    const ci = idx.get(g.faceId) ?? 0
    const col = rgb[ci]
    for (let i = g.start; i < g.start + g.count; i++) {
      const v = t[i] * 3
      out[v] = col[0]; out[v + 1] = col[1]; out[v + 2] = col[2]
    }
  }
  return out
}

// 面组数（distinct faceId）—— UI 报「N 个面组」。
export function faceGroupCount(mesh: FGMesh): number {
  if (!mesh.faceGroups) return 0
  const s = new Set<number>()
  for (const g of mesh.faceGroups) s.add(g.faceId)
  return s.size
}
