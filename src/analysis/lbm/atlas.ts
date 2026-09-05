// atlas.ts —— 3D 格子点阵点样变成一张 2D texture。
//
// WebGL2 一次只可以 render 入 TEXTURE_3D 嘅【一层】(framebufferTextureLayer)，冇 geometry
// shader、冇 layered rendering。一个 LBM step 要掂晒每个 cell，如果拆成 NZ 次 draw，
// 就变成每个 substep × 每个分布 target 都要 bind NZ 次 framebuffer。
// 所以分布住喺一张【平面 2D texture】，Z 切片砌成 tile，一个全屏三角形一次 draw 扫晒成个体积。
//
//       +--------+--------+--------+--------+       横向 TX 个 tile
//       | z = 0  | z = 1  | z = 2  | z = 3  |       每个 tile 系 NX × NY
//       +--------+--------+--------+--------+
//       | z = 4  | z = 5  | z = 6  | z = 7  |       atlas 大细 = (TX*NX) × (TY*NY)
//       +--------+--------+--------+--------+
//
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
// ★                                                                             ★
// ★  atlas 【永远唔可以开 filtering】。GL_TEXTURE_MIN_FILTER / MAG_FILTER 一定要   ★
// ★  係 NEAREST，而且每一次读都要用 texelFetch()，唔好用 texture()。               ★
// ★                                                                             ★
// ★  原因：一个 texel 嘅 +z 邻居实际上喺【隔离一个 tile】嘅位置。只要有一次 bilinear ★
// ★  抽样跨过 tile 边界，硬件就会静静鸡沟埋【两个唔同嘅 Z 切片】—— 唔会报错、唔会    ★
// ★  黑屏，只会令流场喺 tile 接缝位多咗一层假扩散，而你要跑到出咗 Cd 先发现唔对路。   ★
// ★                                                                             ★
// ★  真係要 trilinear 嘅嘢（粒子对流、体积渲染）→ 读 solver 每帧 resolve 出嚟嗰张    ★
// ★  真 TEXTURE_3D 速度场，唔好读 atlas。                                         ★
// ★                                                                             ★
// ★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★★
//
// 最后一行 tile 嘅尾巴系 padding。嗰啲 texel 嘅 z >= NZ，绝对唔可以喺嗰度计嘢 ——
// 所有 shader 开头都 discard 佢哋（isPadding）。

export interface AtlasLayout {
  nx: number; ny: number; nz: number
  /** 横向 / 纵向 tile 数 */
  tx: number; ty: number
  /** atlas texture 尺寸（texel） */
  width: number; height: number
  cells: number
  texels: number
  padTexels: number
}

/**
 * 拣一个令 atlas 尽量【正方】嘅 tile 数 —— 反正 driver 都系 allocate 个 bounding rectangle，
 * 长条形只会更快撞到 MAX_TEXTURE_SIZE。同分嘅时候拣 padding 少嗰个。
 *
 * 评分 = max(w,h)/min(w,h) + 0.001*(tx*ty - nz)
 *        └ 方唔方           └ 浪费几多个 tile（权重细，只做 tie-break）
 */
export function layout(nx: number, ny: number, nz: number, maxTexture = 16384): AtlasLayout {
  if (!(nx >= 1 && ny >= 1 && nz >= 1)) throw new Error('atlas.layout: lattice dims must be >= 1, got ' + nx + 'x' + ny + 'x' + nz)
  let best: { tx: number; ty: number; w: number; h: number; score: number } | null = null
  for (let tx = 1; tx <= nz; tx++) {
    const ty = Math.ceil(nz / tx)
    const w = tx * nx, h = ty * ny
    if (w > maxTexture || h > maxTexture) continue
    const score = Math.max(w, h) / Math.min(w, h) + 0.001 * (tx * ty - nz)
    if (!best || score < best.score) best = { tx, ty, w, h, score }
  }
  if (!best) throw new Error('lattice ' + nx + 'x' + ny + 'x' + nz + ' does not fit in a ' + maxTexture + ' texture')
  return {
    nx, ny, nz,
    tx: best.tx, ty: best.ty,
    width: best.w, height: best.h,
    cells: nx * ny * nz,
    texels: best.w * best.h,
    padTexels: best.w * best.h - nx * ny * nz,
  }
}

/** (x,y,z) → atlas texel。同 texelToCell 系【严格互逆】（runSelfCheck 逐格验）。 */
export function cellToTexel(A: AtlasLayout, x: number, y: number, z: number): [number, number] {
  const tx = z % A.tx, ty = (z / A.tx) | 0
  return [tx * A.nx + x, ty * A.ny + y]
}

/** atlas texel → (x,y,z)。z >= nz 即系 padding。 */
export function texelToCell(A: AtlasLayout, u: number, v: number): [number, number, number] {
  const x = u % A.nx, tx = (u / A.nx) | 0
  const y = v % A.ny, ty = (v / A.ny) | 0
  return [x, y, ty * A.tx + tx]
}

/** ping-pong 分布场要几多 VRAM（byte）。 */
export function distributionBytes(A: AtlasLayout, nTargets: number, bytesPerChannel = 4): number {
  return A.texels * 4 * bytesPerChannel * nTargets * 2
}

/**
 * GLSL 嗰边。NX/NY/NZ/TX/TY/ATLAS_W/ATLAS_H 全部烘成【字面 #define】—— 唔係 uniform。
 * 只有咁 compiler 先知道除数同模数系常数，先至可以喺 2 嘅次方时变 shift、
 * 唔係 2 嘅次方时变 multiply-high。用 uniform 就系每格每方向一次真整数除法。
 */
export function glslHeader(A: AtlasLayout): string {
  return [
    '// ---- generated from src/analysis/lbm/atlas.ts. Do not hand-edit. ----',
    '#define NX ' + A.nx,
    '#define NY ' + A.ny,
    '#define NZ ' + A.nz,
    '#define TX ' + A.tx,
    '#define TY ' + A.ty,
    '#define ATLAS_W ' + A.width,
    '#define ATLAS_H ' + A.height,
    'const vec3 GRID = vec3(' + A.nx + '.0, ' + A.ny + '.0, ' + A.nz + '.0);',
    '',
    '// NEVER sample the atlas with filtering: one bilinear tap across a tile border',
    '// silently blends two different Z slices. Every read is a texelFetch.',
    'ivec2 cellToTexel(ivec3 p) {',
    '  int tx = p.z % TX;',
    '  int ty = p.z / TX;',
    '  return ivec2(tx * NX + p.x, ty * NY + p.y);',
    '}',
    '',
    'ivec3 texelToCell(ivec2 t) {',
    '  int x = t.x % NX, tx = t.x / NX;',
    '  int y = t.y % NY, ty = t.y / NY;',
    '  return ivec3(x, y, ty * TX + tx);',
    '}',
    '',
    'bool inGrid(ivec3 p) {',
    '  return all(greaterThanEqual(p, ivec3(0))) && all(lessThan(p, ivec3(NX, NY, NZ)));',
    '}',
    '',
    '// A texel in the padded tail of the last tile row. Nothing may be computed there.',
    'bool isPadding(ivec3 c) { return c.z >= NZ; }',
    '',
  ].join('\n')
}

/* ─────────────────────────────────────────────── runSelfCheck */

export interface SelfCheckResult { pass: boolean; failures: string[] }

/** 唔使 GL、唔使 test runner 都跑得嘅自检（详见 lattice.ts 嘅用法注释）。 */
export function runSelfCheck(): SelfCheckResult {
  const failures: string[] = []
  const ck = (c: boolean, m: string) => { if (!c) failures.push(m) }

  const sizes: [number, number, number][] = [
    [8, 8, 8], [160, 80, 80], [96, 48, 48], [128, 64, 64],
    [208, 104, 104], [17, 5, 13], [64, 64, 1], [3, 3, 7],
    // webcad 风洞域嘅真实比例（流向长、横截面细）
    [96, 40, 40], [140, 56, 56],
  ]
  for (const [nx, ny, nz] of sizes) {
    const A = layout(nx, ny, nz)
    const tag = nx + 'x' + ny + 'x' + nz

    ck(A.tx * A.ty >= nz, tag + ': tiles do not cover all slices')
    ck(A.width <= 16384 && A.height <= 16384, tag + ': atlas exceeds the texture limit')
    ck(A.padTexels >= 0, tag + ': negative padding')
    ck(A.texels === A.width * A.height, tag + ': texel count disagrees with the atlas size')

    // 映射系单射，而且来回不变
    const seen = new Set<number>()
    let broke = false
    for (let z = 0; z < nz && !broke; z++) for (let y = 0; y < ny && !broke; y++) for (let x = 0; x < nx; x++) {
      const t = cellToTexel(A, x, y, z)
      if (!(t[0] >= 0 && t[0] < A.width && t[1] >= 0 && t[1] < A.height)) {
        failures.push(tag + ': texel out of atlas at ' + [x, y, z]); broke = true; break
      }
      const key = t[1] * A.width + t[0]
      if (seen.has(key)) { failures.push(tag + ': two cells map to texel ' + t); broke = true; break }
      seen.add(key)
      const c = texelToCell(A, t[0], t[1])
      if (c[0] !== x || c[1] !== y || c[2] !== z) {
        failures.push(tag + ': round trip ' + [x, y, z] + ' -> ' + t + ' -> ' + c); broke = true; break
      }
    }
    if (broke) continue
    ck(seen.size === nx * ny * nz, tag + ': mapping is not injective')

    // 每个 atlas texel 唔係真 cell 就係 z >= nz 嘅 padding，冇第三种
    let real = 0, pad = 0
    for (let v = 0; v < A.height; v++) for (let u = 0; u < A.width; u++) {
      const cc = texelToCell(A, u, v)
      if (cc[2] < nz) { real++; ck(seen.has(v * A.width + u), tag + ': texel ' + [u, v] + ' claims cell ' + cc + ' but no cell maps there') }
      else pad++
    }
    ck(real === nx * ny * nz, tag + ': counted ' + real + ' real texels, expected ' + (nx * ny * nz))
    ck(pad === A.padTexels, tag + ': padding count mismatch ' + pad + ' vs ' + A.padTexels)

    const h = glslHeader(A)
    ck(h.indexOf('#define NX ' + nx) >= 0 && h.indexOf('#define TX ' + A.tx) >= 0, tag + ': GLSL header constants wrong')
    ck(h.indexOf('#define ATLAS_W ' + A.width) >= 0 && h.indexOf('#define ATLAS_H ' + A.height) >= 0, tag + ': GLSL atlas size wrong')
  }

  // 大到装唔落 texture 嘅点阵要【掟错】，唔可以静静鸡截断
  let threw = false
  try { layout(4096, 4096, 4096, 16384) } catch { threw = true }
  ck(threw, 'an oversized lattice did not throw')

  // 出货用嘅几个尺寸 padding 要细
  for (const p of [[96, 48, 48], [128, 64, 64], [160, 80, 80], [208, 104, 104]] as [number, number, number][]) {
    const A2 = layout(p[0], p[1], p[2])
    ck(A2.padTexels / A2.texels < 0.12, p.join('x') + ': ' + ((A2.padTexels / A2.texels) * 100).toFixed(1) + '% of the atlas is padding')
  }

  return { pass: failures.length === 0, failures }
}
