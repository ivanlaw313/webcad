// asyncReader.ts —— 由 GPU 攞几个 float 返嚟，而【唔会】停低条 pipeline。
//
// gl.readPixels 读入 client memory 会令 CPU 等 GPU 排干。喺 1M cell 嘅 lattice 上面，
// 呢一下比成个 LBM step 仲贵 —— 而我哋想攞嘅淨係【四个 float】（reduce 到 1×1 嘅合力）。
//
// 读入一个常驻嘅 PIXEL_PACK_BUFFER 就唔会停：GL 记低「将来把嗰 4×4 byte 抄入呢个 buffer」，
// 我哋 fenceSync，然后【喺后面某一帧】先至去执货。
//
// ★ clientWaitSync(sync, 0, 0) —— timeout 係零，永远唔会 block ★
//   主线程上面用非零 timeout 就係「我情愿卡住成个 UI」。TIMEOUT_EXPIRED → 还 null，下帧再问。
//
//
// 点解唔用 three 嘅 readRenderTargetPixelsAsync()
// ────────────────────────────────────────────
//  1. 佢每次 call 都【新建同删除】一个 PBO。我哋每帧都要问，呢个係 per-frame allocation。
//  2. 佢 await 一个 4ms 粒度嘅 promise（内部 setTimeout 轮询），cadence 唔喺我哋手上。
//  3. ★ 收敛判定係由「成功读到几多次」驱动，唔係由「跑咗几多帧」驱动 ★ —— 采样器要自己
//     知道呢一帧到底有冇新数字，先至唔会把同一个 Cd 数十次咁塞入收敛窗口，扮到已经收敛。
//     poll() 还 null 就係「今帧冇新嘢」，呢个信息 promise 版本根本表达唔到。
//
// ⚠ request() 会 bind READ_FRAMEBUFFER 同 call readBuffer() —— 呢啲係绕过 three 嘅 raw 操作。
//   跑完请 call renderer.resetState()（lbmGpu.ts 嘅 advance() 已经做咗）。

export class AsyncPixelReader {
  private gl: WebGL2RenderingContext
  private buf: WebGLBuffer | null
  private sync: WebGLSync | null = null
  private pending = false
  private disposed = false
  /** 结果 buffer，常驻，永远唔重新分配 */
  readonly out: Float32Array
  readonly floats: number

  constructor(gl: WebGL2RenderingContext, floats: number) {
    this.gl = gl
    this.floats = floats
    this.out = new Float32Array(floats)
    this.buf = gl.createBuffer()
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buf)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, floats * 4, gl.STREAM_READ)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
  }

  get inFlight(): boolean { return this.pending }

  /**
   * 落一次读。已经有一个喺途中就【唔会】叠加（还 false）—— 一个 reader 一个 fence，
   * 唔係嘅话 sync object 会漏，而且新旧数据会撞。
   *
   * @param fb   要读嘅 framebuffer（raw WebGLFramebuffer；null = 画布）
   * @param attachment COLOR_ATTACHMENT 编号
   */
  request(fb: WebGLFramebuffer | null, attachment: number, x: number, y: number, w: number, h: number): boolean {
    if (this.pending || this.disposed) return false
    const gl = this.gl
    if (gl.isContextLost()) return false
    if (w * h * 4 > this.floats) return false        // 读多过个 buffer 装得落 = INVALID_OPERATION

    const prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fb)
    gl.readBuffer(gl.COLOR_ATTACHMENT0 + attachment)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buf)
    gl.readPixels(x, y, w, h, gl.RGBA, gl.FLOAT, 0)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    // readBuffer 係 per-FBO state。还原成 COLOR_ATTACHMENT0 —— 唔係嘅话下一个读呢个 FBO
    // 嘅人（包括 three 自己嘅 readRenderTargetPixels）会静静鸡读咗第二个 attachment。
    gl.readBuffer(gl.COLOR_ATTACHMENT0)
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead)

    this.sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (!this.sync) return false
    gl.flush()          // 冇 flush 嘅话 fence 可能永远唔会入到 GPU queue → poll 永远 TIMEOUT
    this.pending = true
    return true
  }

  /**
   * 睇吓落咗嘅嗰次读到未。
   *
   *   null  = 未到（或者根本冇 request 过）→ 咩都唔好做，下帧再问
   *   数组  = 到咗，内容係 this.out（【会被下一次 poll 覆写】，要留就自己 copy）
   */
  poll(): Float32Array | null {
    if (!this.pending || this.disposed) return null
    const gl = this.gl
    if (gl.isContextLost()) { this.sync = null; this.pending = false; return null }
    const st = gl.clientWaitSync(this.sync as WebGLSync, 0, 0)   // ★ zero timeout：永远唔 block ★
    if (st === gl.TIMEOUT_EXPIRED) return null
    gl.deleteSync(this.sync as WebGLSync)
    this.sync = null
    this.pending = false
    if (st === gl.WAIT_FAILED) return null
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buf)
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.out)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    return this.out
  }

  /** 掟走途中嗰次读（换零件 / 换 tier 之后旧数字係谎话）。 */
  cancel(): void {
    if (!this.pending) return
    if (this.sync) { try { this.gl.deleteSync(this.sync) } catch { /* context 冇咗就算 */ } }
    this.sync = null
    this.pending = false
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancel()
    if (this.buf) { try { this.gl.deleteBuffer(this.buf) } catch { /* 同上 */ } }
    this.buf = null
  }
}
