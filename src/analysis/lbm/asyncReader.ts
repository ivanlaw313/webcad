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
//
//
// ═══════════════════════════════════════════════════════════════════════════════
// ★★ fence 卡死偵測 + 同步退階（2026-10-01）★★
// ═══════════════════════════════════════════════════════════════════════════════
//
// 【已觀察到嘅事實】GM 喺用戶真 Chrome + RTX 5070 Ti（2026-10-01）實測：
//   當 `document.hidden === true` 嗰陣，fenceSync 落咗之後【永遠唔 signal】——
//   clientWaitSync(sync, 0, 0) 次次 TIMEOUT_EXPIRED、getSyncParameter 次次 UNSIGNALED，
//   ★ 連 gl.finish() 都救唔到 ★。同一段最小重現碼喺 Claude 內嵌 browser pane 亦然。
//
// 【未證實，唔准當已知】上面只係喺 hidden tab 重現過。前景 tab 會唔會正常 signal
//   【未測】。所以呢度一律寫「已觀察到喺 hidden tab 必然發生；前景未測」，
//   唔好寫成「只有背景 tab 會壞」。
//
// 【後果】pending 永遠卡 true → request() 之後再唔會落新單 → lbmGpu 嘅 _fresh/_haveArea
//   永遠 false → pollForce() 永遠返 null → GPU 風洞一個 Cd 都唔報，而且【完全冇聲】：
//   唔 throw、唔 warn、唔退階、UI 停喺 0%。靜靜雞唔出數字係最惡劣嘅失敗模式。
//
// 【處理】連續 N 次 poll 都 TIMEOUT 就當 fence 壞咗，退階做同步 readPixels
//   （唔綁 PIXEL_PACK_BUFFER = 即時返，完全唔經 fence）。
//
//   ⚠ 代價：同步讀會令嗰一幀 CPU 等 GPU 排干 pipeline —— 喺 1M cell 上面可能幾毫秒
//     到十幾毫秒，即係掉幀。但【慢一幀】遠遠好過【永遠冇數字而且冇聲】：
//     慢可以見到、可以量、可以再調；靜靜雞冇數字就係講大話。
//
//   退階之後【一直】行同步路，唔會每幀再試一次 fence（咁就等於每幀蝕 N 幀延遲，
//   即係用一個慢 bug 換另一個慢 bug）。換 solver / 換 context 之後 call reset() 重新試。
//
export type ReadbackMode = 'async' | 'sync-fallback'

export interface AsyncPixelReaderOpts {
  /** 連續幾次 poll 全 TIMEOUT 先當壞（連同 stallMs 一齊，兩個都要超） */
  stallPolls?: number
  /** 由 request() 起計幾多 ms（牆上時鐘）先當壞（連同 stallPolls 一齊，兩個都要超） */
  stallMs?: number
  /** 時鐘注入口（測試用）。預設 performance.now()，冇就 Date.now() */
  now?: () => number
  /** 一次性警告嘅出口（測試用）。預設 console.warn */
  warn?: (msg: string) => void
  /** 警告裏面嘅名（force / torque / area），方便喺 console 認人 */
  label?: string
}

/*
 * ── 點揀 N ──────────────────────────────────────────────────────────────────
 *
 * 用【兩個】門檻，而且兩個都要超過先判壞。單用其中一個都會誤判：
 *
 *  ① poll 次數 ≥ 12
 *     正常情況 fence 一兩幀就 signal：WebGL driver 嘅 command queue 一般深 2–3 幀
 *     （Chrome 嘅 GPU process 再隔一層），所以最壞嘅【正常】延遲大概 3 幀。
 *     12 = 3 幀 × 4 倍安全邊際。再大就係白等，再細就會喺一次 GPU hiccup 上面誤判。
 *     但 poll 次數單獨唔可信：caller 可以喺一個 tight loop 裏面 poll 而完全冇 render，
 *     咁 12 次可能發生喺一毫秒之內，而 fence 其實只係仲未夠時間 signal。
 *
 *  ② 牆上時鐘 ≥ 1000 ms
 *     60fps 之下 1 秒 = 60 幀；就算成個 tab 掉到 10fps、queue 深 4 幀都只係 400ms。
 *     一個【四個 float】嘅 readback 過咗足足一秒都未落地，唔係延遲，係卡死。
 *     時鐘單獨又唔可信：hidden tab 嘅 rAF 可能慢到 1 Hz 甚至停，一秒可能只 poll 過一次，
 *     用一次 TIMEOUT 就判死太武斷。
 *
 *  兩個一齊 = 「問過好多次，而且真係等過好一陣」。呢個組合喺正常硬件上面唔應該命中。
 *
 *  ⚠ 代價寫明：判壞之前會蝕最多 12 次 poll / 1 秒嘅無數字時間。呢一秒鐘係【一次性】嘅
 *    （退階之後唔再重試），換嚟嘅係唔會喺一次 GPU hiccup 上面永久降速。
 */
const DEFAULT_STALL_POLLS = 12
const DEFAULT_STALL_MS = 1000

interface ReadRect {
  fb: WebGLFramebuffer | null
  attachment: number
  x: number; y: number; w: number; h: number
}

const defaultNow: () => number =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now()

export class AsyncPixelReader {
  private gl: WebGL2RenderingContext
  private buf: WebGLBuffer | null
  private sync: WebGLSync | null = null
  private pending = false
  private disposed = false
  /** 结果 buffer，常驻，永远唔重新分配 */
  readonly out: Float32Array
  readonly floats: number

  /* ── 卡死偵測 ── */
  private readonly stallPolls: number
  private readonly stallMs: number
  private readonly now: () => number
  private readonly warn: (msg: string) => void
  private readonly label: string
  /** 今次 request 之後連續 TIMEOUT 咗幾次 */
  private timeouts = 0
  /** 今次 request 落單嗰刻嘅時鐘 */
  private requestedAt = 0
  /** 退階狀態。一旦 true 就【一直】行同步路，直到 reset() */
  private fellBack = false
  private fallbackReason: string | null = null
  private warned = false
  /** 上一次 request 嘅矩形 —— 退階之後同步讀要用返同一組參數 */
  private lastRect: ReadRect | null = null
  /** 同步路：今帧有冇一个【未被执过】嘅新数字 */
  private syncReady = false

  constructor(gl: WebGL2RenderingContext, floats: number, opts: AsyncPixelReaderOpts = {}) {
    this.gl = gl
    this.floats = floats
    this.out = new Float32Array(floats)
    this.stallPolls = opts.stallPolls ?? DEFAULT_STALL_POLLS
    this.stallMs = opts.stallMs ?? DEFAULT_STALL_MS
    this.now = opts.now ?? defaultNow
    this.warn = opts.warn ?? ((m: string) => { console.warn(m) })
    this.label = opts.label ?? 'pixel'
    this.buf = gl.createBuffer()
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buf)
    gl.bufferData(gl.PIXEL_PACK_BUFFER, floats * 4, gl.STREAM_READ)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
  }

  get inFlight(): boolean { return this.pending }

  /**
   * 而家行緊邊條路。★ caller 要讀得到呢個 ★ —— 靜靜雞退階係另一種講大話。
   *   'async'          = PBO + fence（快，唔停 pipeline）
   *   'sync-fallback'  = 同步 readPixels（每次讀蝕一幀，但一定有數字）
   */
  get mode(): ReadbackMode { return this.fellBack ? 'sync-fallback' : 'async' }
  /** 由上次 reset() 到而家有冇退階過 */
  get degraded(): boolean { return this.fellBack }
  /** 退階原因（'fence-stall' / 'wait-failed'），冇退階就 null */
  get degradeReason(): string | null { return this.fallbackReason }

  /**
   * 落一次读。已经有一个喺途中就【唔会】叠加（还 false）—— 一个 reader 一个 fence，
   * 唔係嘅话 sync object 会漏，而且新旧数据会撞。
   *
   * 退階模式之下：即場做同步 readPixels（唔綁 PBO、唔落 fence），然後標一個「有新數」，
   * 由下一次 poll() 執貨 —— 咁 cadence 同 async 路一模一樣（一次 request = 一個新數字）。
   *
   * @param fb   要读嘅 framebuffer（raw WebGLFramebuffer；null = 画布）
   * @param attachment COLOR_ATTACHMENT 编号
   */
  request(fb: WebGLFramebuffer | null, attachment: number, x: number, y: number, w: number, h: number): boolean {
    if (this.pending || this.disposed) return false
    const gl = this.gl
    if (gl.isContextLost()) return false
    if (w * h * 4 > this.floats) return false        // 读多过个 buffer 装得落 = INVALID_OPERATION

    const rect: ReadRect = { fb, attachment, x, y, w, h }
    this.lastRect = rect

    if (this.fellBack) {
      // ★ 同步路 ★ —— 即時出數，冇 fence 可以卡。代價見檔頭：呢一下 CPU 等 GPU。
      const ok = this._syncRead(rect)
      this.syncReady = ok
      return ok
    }

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
    this.timeouts = 0
    this.requestedAt = this.now()
    return true
  }

  /**
   * 睇吓落咗嘅嗰次读到未。
   *
   *   null  = 未到（或者根本冇 request 过）→ 咩都唔好做，下帧再问
   *   数组  = 到咗，内容係 this.out（【会被下一次 poll 覆写】，要留就自己 copy）
   *
   * ★ 退階之後語義一樣 ★：一次 request 只會有一次 poll 返數組，之後返 null，
   *   唔會把同一個舊數字當新數字連續派出去（收斂採樣器靠呢個分辨「今帧有冇新嘢」）。
   */
  poll(): Float32Array | null {
    if (this.disposed) return null

    // ── 同步路 ──
    if (this.fellBack) {
      if (!this.syncReady) return null
      this.syncReady = false
      return this.out
    }

    if (!this.pending) return null
    const gl = this.gl
    if (gl.isContextLost()) { this._dropSync(); this.pending = false; return null }
    const st = gl.clientWaitSync(this.sync as WebGLSync, 0, 0)   // ★ zero timeout：永远唔 block ★

    if (st === gl.TIMEOUT_EXPIRED) {
      this.timeouts++
      // ★ 兩個門檻都要超 ★ —— 理由見上面「點揀 N」。
      if (this.timeouts >= this.stallPolls && this.now() - this.requestedAt >= this.stallMs) {
        return this._fallback('fence-stall')
      }
      return null
    }

    this._dropSync()
    this.pending = false

    if (st === gl.WAIT_FAILED) {
      // ★ WAIT_FAILED 唔係 timeout ★ —— 係 GL 話「呢個 sync 有事」。再試落多少次 fence
      // 都唔會變好，所以即刻退階，唔准當成「仲未到」咁無限等落去。
      return this._fallback('wait-failed')
    }

    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, this.buf)
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.out)
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)
    return this.out
  }

  /**
   * 判定 fence 壞咗 → 轉同步路，而且即場用上次嘅矩形同步讀一次，令【呢一次 poll】
   * 就有數字返，唔使再等下一個 request。
   */
  private _fallback(reason: string): Float32Array | null {
    this._dropSync()
    this.pending = false
    this.fellBack = true
    this.fallbackReason = reason
    this.syncReady = false
    if (!this.warned) {
      this.warned = true
      this.warn(
        `[LBM asyncReader:${this.label}] GPU fence 讀回卡死（${reason}；` +
        `連續 ${this.timeouts} 次 TIMEOUT / ≥${this.stallMs}ms）→ 退階做同步 readPixels。` +
        '已觀察到喺 document.hidden === true 嘅 tab 必然發生；前景 tab 未測。' +
        '同步讀每次會令 CPU 等 GPU（掉幀），但慢一幀好過永遠冇數字。',
      )
    }
    if (!this.lastRect) return null
    return this._syncRead(this.lastRect) ? this.out : null
  }

  /**
   * 同步 readPixels 入 client memory。★ 關鍵：唔綁 PIXEL_PACK_BUFFER ★ ——
   * 綁住就會變返「寫入 PBO + 要 fence」嗰條壞路；null binding 之下 readPixels
   * 即時返，完全唔經 fence。代價係 CPU 喺呢度等 GPU 排干。
   */
  private _syncRead(r: ReadRect): boolean {
    const gl = this.gl
    if (gl.isContextLost()) return false
    try {
      const prevRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, r.fb)
      gl.readBuffer(gl.COLOR_ATTACHMENT0 + r.attachment)
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null)   // ★ 一定要 null ★
      gl.readPixels(r.x, r.y, r.w, r.h, gl.RGBA, gl.FLOAT, this.out)
      gl.readBuffer(gl.COLOR_ATTACHMENT0)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevRead)
      return true
    } catch {
      return false      // context 中途冇咗 → 當今帧冇數，下帧再試
    }
  }

  /** 放手一个 sync object（context 冇咗都唔会 throw 上去）。 */
  private _dropSync(): void {
    if (this.sync) { try { this.gl.deleteSync(this.sync) } catch { /* context 冇咗就算 */ } }
    this.sync = null
  }

  /** 掟走途中嗰次读（换零件 / 换 tier 之后旧数字係谎话）。 */
  cancel(): void {
    // 同步路冇 fence 可以掟，但嗰个「已经读咗未执」嘅数字同样係上一个姿态嘅谎话。
    this.syncReady = false
    if (!this.pending) return
    this._dropSync()
    this.pending = false
    this.timeouts = 0
  }

  /**
   * 把退階狀態推返去零，下次 request() 會【重新試】async 路。
   *
   * ★ 唔好喺帧循环裏面 call ★ —— 每帧 reset 一次就等於每帧重新蝕 stallPolls 次
   * poll / stallMs 毫秒嘅無數字時間。呢个入口係畀「换 solver / 换 WebGL context /
   * 换 tier」之後用：嗰阵係一个新嘅 GPU 环境，上次嘅判定唔再适用。
   */
  reset(): void {
    this.cancel()
    this.fellBack = false
    this.fallbackReason = null
    this.warned = false
    this.timeouts = 0
    this.lastRect = null
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancel()
    if (this.buf) { try { this.gl.deleteBuffer(this.buf) } catch { /* 同上 */ } }
    this.buf = null
  }
}
