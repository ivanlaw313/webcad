// probeMRT.ts —— ★ 喺 allocate 任何嘢【之前】一定要跑呢个 ★
//
// 每一个 getParameter 都只係一个【承诺】，而喺 tile-based（手机）GPU 上面，承诺之间唔会自动兼容：
//
//   · EXT_color_buffer_float 话你知 RGBA32F 渲染得。
//   · MAX_COLOR_ATTACHMENTS 话你知有八个。
//   · 冇任何一个参数话你知「五个 RGBA32F 可唔可以【同时】掛喺一个 framebuffer 度」——
//     而呢样正正就係 LBM step pass 要做嘅嘢：每 pixel 5 × 128 = 640 bit 嘅 render target，
//     去撞一个佢哋根本冇 expose 出嚟嘅 tile memory 预算。
//
// ★★ checkFramebufferStatus() === COMPLETE 係【必要但唔充分】★★
//    tile-based GPU 会接受晒啲 attachment、报 COMPLETE，然后喺【draw 嗰阵】先至拒绝 ——
//    因为要到嗰阵佢先要真係把成组 attachment 塞入 tile memory。所以呢度一定要真係
//    drawBuffers + clearBufferfv 一次，再抽干 error queue。淨係问 status 会走漏呢个 case，
//    而呢个 case 就係呢个 probe 存在嘅唯一理由。
//
// 唔做嘅话，手机上嘅症状係：喺全 lattice size 分配咗几百 MB → 第一个 framebuffer 唔 COMPLETE →
// 黑屏 + 一段 stack trace。而且【每一个 quality tier 都一样死】，因为 tier 只係改 size，
// 呢件事同 size 完全无关。
//
// 4×4 咁问一次，成本係几个 texture object 同一次 clear，换返嚟係「一句人话」而唔係「一次不明崩溃」。
//
// ⚠ 呢个 probe 会郁 GL 嘅 raw state（framebuffer binding / viewport / drawBuffers）。
//   佢自己会还原返，但如果你係喺一个 live 嘅 three renderer 上面跑，跑完请再 call
//   renderer.resetState() —— three 嘅 state cache 唔知道我哋喺佢背后郁过嘢。

/** 我哋会问嘅内部格式（GL enum 数值写死，唔使 context 都读得明呢个表）。 */
const INTERNAL = { RGBA32F: 0x8814, RGBA16F: 0x881a } as const
export type MrtFormat = keyof typeof INTERNAL

export interface MrtLevel {
  /** 例如 "5 x RGBA32F" */
  label: string
  n: number
  fmt: MrtFormat
  ok: boolean
  /** checkFramebufferStatus 嘅原值；0 = probe 喺攞到 status 之前已经掟错 */
  status: number
  statusName: string
}

export interface MrtReport {
  webgl2: boolean
  contextLost: boolean
  /** ★ 主答案 ★：五个 RGBA32F 真係画得（唔淨係 COMPLETE，係 clear 完都冇 GL error） */
  ok: boolean
  /** force-writing step 变体要七个 attachment；呢个係佢画唔画得 */
  force7: boolean
  status: number
  statusName: string
  levels: MrtLevel[]
  /** 画得嘅组合，由大到细 */
  supported: string[]
  colorBufferFloat: boolean
  floatLinear: boolean
  floatBlend: boolean
  parallelCompile: boolean
  maxColorAttachments: number
  maxDrawBuffers: number
  maxTextureSize: number
  max3DTextureSize: number
  maxTextureImageUnits: number
  renderer: string
  /** 一句中文总结，直接可以掟去 UI */
  reason: string
}

/** spec 用嘅 hex 写返做人话 —— 单单一个 0x8cdd 对任何人都冇意义。 */
export function fbStatusName(gl: WebGL2RenderingContext, st: number): string {
  if (st === 0) return 'probe 喺攞到 status 之前已经掟错（driver 直接拒绝咗呢次分配）'
  if (st === gl.FRAMEBUFFER_COMPLETE) return 'COMPLETE'
  if (st === gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT) return 'INCOMPLETE_ATTACHMENT（attachment 冇拎到真存储）'
  if (st === gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT) return 'INCOMPLETE_MISSING_ATTACHMENT'
  if (st === gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE) return 'INCOMPLETE_MULTISAMPLE'
  if (st === gl.FRAMEBUFFER_UNSUPPORTED) return 'UNSUPPORTED（呢部 GPU 唔肯渲染呢个格式组合）'
  return '0x' + Number(st).toString(16)
}

function drainErrors(gl: WebGL2RenderingContext): void {
  // 上限係防守：context lost 之后 getError 会永远还 CONTEXT_LOST_WEBGL，唔封顶就死 loop。
  for (let i = 0; i < 64; i++) if (gl.getError() === gl.NO_ERROR) return
}

/**
 * 喺 4×4 试一组 attachment。永远唔会 throw，永远唔会漏 GL object。
 * 返回 checkFramebufferStatus 嘅结果，但係【draw-time 验证之后】嘅版本。
 */
function probeLevel(gl: WebGL2RenderingContext, n: number, fmt: MrtFormat): { ok: boolean; status: number } {
  const texs: (WebGLTexture | null)[] = []
  const fb = gl.createFramebuffer()
  // 0 = 「喺攞到 status 之前已经掟错」。catch 唔会覆写佢 —— 掟错本身就係答案。
  let st = 0
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  try {
    const bufs: number[] = []
    for (let i = 0; i < n; i++) {
      const t = gl.createTexture()
      texs.push(t)                 // ★ push 喺任何可能掟错之前，否则会变孤儿 texture
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texStorage2D(gl.TEXTURE_2D, 1, INTERNAL[fmt], 4, 4)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0)
      bufs.push(gl.COLOR_ATTACHMENT0 + i)
    }
    st = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (st === gl.FRAMEBUFFER_COMPLETE) {
      // ★ COMPLETE 之后仲要真係画一 pass ★（见文件头）
      drainErrors(gl)
      gl.drawBuffers(bufs)
      gl.viewport(0, 0, 4, 4)
      for (let i = 0; i < n; i++) gl.clearBufferfv(gl.COLOR, i, [0, 0, 0, 0])
      gl.finish()
      if (gl.getError() !== gl.NO_ERROR) st = gl.FRAMEBUFFER_UNSUPPORTED
    }
  } catch { /* st 留返 0：driver 直接拒绝咗，连 status 都畀唔到 */ }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.deleteFramebuffer(fb)
  for (const t of texs) if (t) gl.deleteTexture(t)
  return { ok: st === gl.FRAMEBUFFER_COMPLETE, status: st }
}

const EMPTY: MrtReport = {
  webgl2: false, contextLost: false, ok: false, force7: false,
  status: 0, statusName: '冇 WebGL2 context',
  levels: [], supported: [],
  colorBufferFloat: false, floatLinear: false, floatBlend: false, parallelCompile: false,
  maxColorAttachments: 0, maxDrawBuffers: 0, maxTextureSize: 0, max3DTextureSize: 0, maxTextureImageUnits: 0,
  renderer: 'unknown',
  reason: '呢个环境冇 WebGL2 —— GPU 风洞用唔到，要行返 CPU 求解器',
}

/**
 * 问 GPU：你【真係】做唔做得到我要嘅嘢。
 *
 * ★ 永远唔会 throw ★ —— 佢存在嘅原因就係要把一次崩溃变成一份报告。
 */
export function probeMRT(gl: WebGL2RenderingContext | null | undefined): MrtReport {
  if (!gl || typeof (gl as WebGL2RenderingContext).texStorage2D !== 'function') {
    return { ...EMPTY, levels: [], supported: [] }
  }
  if (gl.isContextLost && gl.isContextLost()) {
    return { ...EMPTY, webgl2: true, contextLost: true, statusName: 'context lost', reason: 'WebGL context 已经遗失 —— 唔係缺功能，重建 canvas 就得' }
  }

  // EXT_color_buffer_float 一定要喺 probe 之前攞：冇佢 RGBA32F 根本唔係 renderable，
  // 咁 probe 出嚟嘅 UNSUPPORTED 就淨係反映「你未开 extension」，唔係硬件真相。
  const cbf = !!gl.getExtension('EXT_color_buffer_float')
  const floatLinear = !!gl.getExtension('OES_texture_float_linear')
  const floatBlend = !!gl.getExtension('EXT_float_blend')
  const parallelCompile = !!gl.getExtension('KHR_parallel_shader_compile')
  const dbg = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null

  const prevFb = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const prevVp = gl.getParameter(gl.VIEWPORT) as Int32Array

  const want: { n: number; fmt: MrtFormat }[] = [
    { n: 5, fmt: 'RGBA32F' },   // solver 今日真正要嘅嘢
    { n: 5, fmt: 'RGBA16F' },   // 半精度后备（如果将来有人写）
    { n: 4, fmt: 'RGBA32F' },
    { n: 1, fmt: 'RGBA32F' },   // 连呢个都唔得 = 呢部机嘅「浮点渲染」係讲笑
  ]

  const maxColorAttachments = gl.getParameter(gl.MAX_COLOR_ATTACHMENTS) as number
  const maxDrawBuffers = gl.getParameter(gl.MAX_DRAW_BUFFERS) as number

  // force-writing step 变体要七个（5 分布 + oForce + oTorque）。attachment 数唔够就唔使试。
  if (maxColorAttachments >= 7 && maxDrawBuffers >= 7) want.unshift({ n: 7, fmt: 'RGBA32F' })

  const levels: MrtLevel[] = []
  for (const lv of want) {
    const r = probeLevel(gl, lv.n, lv.fmt)
    levels.push({
      label: lv.n + ' x ' + lv.fmt,
      n: lv.n, fmt: lv.fmt, ok: r.ok, status: r.status,
      statusName: fbStatusName(gl, r.status),
    })
  }

  // 还原我哋郁过嘅 raw state（三：drawBuffers 係 per-FBO 嘅，而个 FBO 已经删咗，唔使还原）
  gl.bindFramebuffer(gl.FRAMEBUFFER, prevFb)
  if (prevVp && prevVp.length === 4) gl.viewport(prevVp[0], prevVp[1], prevVp[2], prevVp[3])
  drainErrors(gl)   // probe 自己整出嚟嘅 error 就係答案，唔应该留低毒害下一段代码

  const find = (n: number, fmt: MrtFormat) => levels.find((l) => l.n === n && l.fmt === fmt)
  const five = find(5, 'RGBA32F')
  const seven = find(7, 'RGBA32F')

  const ok = !!five?.ok
  const force7 = !!seven?.ok
  const lost = !!(gl.isContextLost && gl.isContextLost())

  let reason: string
  if (lost) reason = 'WebGL context 喺 probe 期间遗失咗 —— 唔係缺功能，重建 canvas 再试'
  else if (!cbf) reason = '呢部机冇 EXT_color_buffer_float：浮点 render target 用唔到，GPU 风洞冇得行'
  else if (!ok) reason = '五个 RGBA32F attachment 同时用唔到（' + (five?.statusName || '?') + '）—— tile memory 唔够，GPU 风洞冇得行'
  else if (!force7) reason = '五个 RGBA32F 得，但七个唔得（' + (seven?.statusName || 'MAX_COLOR_ATTACHMENTS=' + maxColorAttachments) + '）—— 流场画得，但量唔到阻力'
  else reason = 'GPU 风洞可以行（' + levels.filter((l) => l.ok).map((l) => l.label).join('、') + '）'

  return {
    webgl2: true,
    contextLost: lost,
    ok,
    force7,
    status: five ? five.status : 0,
    statusName: five ? five.statusName : fbStatusName(gl, 0),
    levels,
    supported: levels.filter((l) => l.ok).map((l) => l.label),
    colorBufferFloat: cbf,
    floatLinear,
    floatBlend,
    parallelCompile,
    maxColorAttachments,
    maxDrawBuffers,
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    max3DTextureSize: gl.getParameter(gl.MAX_3D_TEXTURE_SIZE) as number,
    maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS) as number,
    renderer: dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER)),
    reason,
  }
}
