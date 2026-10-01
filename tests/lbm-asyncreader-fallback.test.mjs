// asyncReader 卡死偵測 + 同步退階 headless 驗收。
//
//   node --experimental-strip-types --test tests/lbm-asyncreader-fallback.test.mjs
//
// ⚠ 呢度【冇 GPU】（node 開唔到 WebGL2），所以全部用一個手寫嘅假 WebGL2 context。
//   即係話：呢份測試證明嘅係【我哋嘅狀態機】正確，唔係證明真 driver 上面個退階真係出數。
//   真硬件驗證要喺 Chrome 入面跑（GM 2026-10-01 已證 hidden tab 必然卡死；前景未測）。
//
// 被測嘅 bug：fenceSync 落咗之後永遠唔 signal → pending 永遠 true → request() 再唔落單
//   → lbmGpu 嘅 _fresh/_haveArea 永遠 false → pollForce() 永遠 null → 一個 Cd 都唔報，
//   而且完全冇聲。

import test from 'node:test'
import assert from 'node:assert/strict'

import { AsyncPixelReader } from '../src/analysis/lbm/asyncReader.ts'

/* ══════════════════════════════════════════════════ 假 WebGL2 context */

const GL_CONST = {
  PIXEL_PACK_BUFFER: 0x88eb,
  STREAM_READ: 0x88e1,
  READ_FRAMEBUFFER: 0x8ca8,
  READ_FRAMEBUFFER_BINDING: 0x8caa,
  COLOR_ATTACHMENT0: 0x8ce0,
  RGBA: 0x1908,
  FLOAT: 0x1406,
  SYNC_GPU_COMMANDS_COMPLETE: 0x9117,
  ALREADY_SIGNALED: 0x911a,
  TIMEOUT_EXPIRED: 0x911b,
  CONDITION_SATISFIED: 0x911c,
  WAIT_FAILED: 0x911d,
}

/**
 * fenceMode:
 *   'normal'  —— 第 2 次 clientWaitSync 就 signal（即係正常硬件嘅樣）
 *   'never'   —— 永遠 TIMEOUT_EXPIRED（★ 真實已觀察到嘅 hidden-tab 行為 ★）
 *   'fail'    —— 即刻 WAIT_FAILED
 */
function makeGL({ fenceMode = 'normal', signalAfter = 2 } = {}) {
  const log = []
  const gl = {
    ...GL_CONST,
    // ── 統計／可觀測狀態 ──
    log,
    syncsCreated: 0,
    syncsDeleted: 0,
    liveSyncs: new Set(),
    packBinding: null,
    readFbBinding: null,
    readBufferOf: new Map(),
    /** PBO 路（getBufferSubData）攞到嘅數 */
    pboValue: [1, 2, 3, 4],
    /** 同步路（readPixels 入 client memory）攞到嘅數 —— 特意同 PBO 路唔同，
     *  咁就捉得到「退階之後其實冇讀過，只係派返舊 out」呢種假成功。 */
    syncValue: [10, 20, 30, 40],
    syncReads: 0,
    asyncReadPixels: 0,
    contextLost: false,
    flushes: 0,

    isContextLost() { return this.contextLost },
    createBuffer() { return { id: 'buf' } },
    deleteBuffer() { log.push('deleteBuffer') },
    bindBuffer(target, b) { if (target === GL_CONST.PIXEL_PACK_BUFFER) this.packBinding = b },
    bufferData() {},
    getParameter(p) {
      if (p === GL_CONST.READ_FRAMEBUFFER_BINDING) return this.readFbBinding
      return null
    },
    bindFramebuffer(target, fb) { if (target === GL_CONST.READ_FRAMEBUFFER) this.readFbBinding = fb },
    readBuffer(mode) { this.readBufferOf.set(this.readFbBinding, mode) },

    readPixels(x, y, w, h, fmt, type, dst) {
      if (this.packBinding) {
        // PBO 路：dst 係一個 byte offset（0），GL 只係記低「將來抄入 PBO」。
        assert.equal(typeof dst, 'number', 'PBO 路嘅 readPixels 第 7 個參數一定係 offset')
        this.asyncReadPixels++
        log.push('readPixels:pbo')
        return
      }
      // 同步路：dst 係 client memory，即時填。
      assert.ok(dst && typeof dst.set === 'function', '同步路嘅 readPixels 一定要收一個 TypedArray')
      dst.set(this.syncValue.slice(0, dst.length))
      this.syncReads++
      log.push('readPixels:sync')
    },

    fenceSync() {
      const s = { id: ++this.syncsCreated, waits: 0 }
      this.liveSyncs.add(s)
      return s
    },
    flush() { this.flushes++ },
    clientWaitSync(s, _flags, _timeout) {
      s.waits++
      if (fenceMode === 'fail') return GL_CONST.WAIT_FAILED
      if (fenceMode === 'never') return GL_CONST.TIMEOUT_EXPIRED
      return s.waits >= signalAfter ? GL_CONST.ALREADY_SIGNALED : GL_CONST.TIMEOUT_EXPIRED
    },
    deleteSync(s) { this.syncsDeleted++; this.liveSyncs.delete(s) },
    getBufferSubData(_target, _off, dst) { dst.set(this.pboValue.slice(0, dst.length)) },
  }
  return gl
}

/** 一個可控時鐘，令測試唔使真等 1 秒。 */
function clock() {
  const c = { t: 0, now: () => c.t, adv(ms) { c.t += ms } }
  return c
}

const FB = { id: 'fbo' }
const REQ = (r) => r.request(FB, 0, 0, 0, 1, 1)

/* ══════════════════════════════════════════════════ 測試 */

test('正常 fence：第 2 次 poll 就出數，永遠唔退階', () => {
  const gl = makeGL({ fenceMode: 'normal', signalAfter: 2 })
  const c = clock()
  const warns = []
  const r = new AsyncPixelReader(gl, 4, { now: c.now, warn: (m) => warns.push(m), label: 'force' })

  for (let frame = 0; frame < 40; frame++) {
    assert.equal(REQ(r), true, `frame ${frame}: request 要落得單`)
    assert.equal(r.poll(), null, 'fence 第 1 次問一定未到')
    const v = r.poll()
    assert.ok(v, 'fence 第 2 次問應該到')
    assert.deepEqual([...v], [1, 2, 3, 4], '要讀到 PBO 路嘅數')
    assert.equal(r.poll(), null, '同一次 request 唔可以派兩次新數')
    c.adv(16)
  }

  assert.equal(r.mode, 'async')
  assert.equal(r.degraded, false)
  assert.equal(r.degradeReason, null)
  assert.deepEqual(warns, [], '正常路唔准 warn')
  assert.equal(gl.syncReads, 0, '正常路一次同步 readPixels 都唔准做')
  assert.equal(gl.syncsCreated, 40)
  assert.equal(gl.syncsDeleted, 40, 'sync object 要逐個放手')
  assert.equal(gl.liveSyncs.size, 0)
})

test('永遠唔 signal 嘅 fence：N 次之後一定退階、一定讀到數、一定報 sync-fallback', () => {
  const gl = makeGL({ fenceMode: 'never' })
  const c = clock()
  const warns = []
  const r = new AsyncPixelReader(gl, 4, { stallPolls: 12, stallMs: 1000, now: c.now, warn: (m) => warns.push(m), label: 'force' })

  assert.equal(REQ(r), true)

  // 未夠門檻之前：一定要【維持】async，唔准過早退階。
  for (let i = 0; i < 11; i++) {
    assert.equal(r.poll(), null, `第 ${i + 1} 次 poll 仲未夠門檻`)
    c.adv(16)
  }
  assert.equal(r.mode, 'async', '11 次 TIMEOUT 唔准退階')

  // 第 12 次 poll：次數夠，但牆上時鐘先 11×16=176ms，★ 兩個門檻都要超 ★ → 仲唔准退階。
  assert.equal(r.poll(), null)
  assert.equal(r.mode, 'async', '次數夠但時鐘未夠 → 唔准退階（防 tight-loop 誤判）')

  // 跳過 1 秒，再問一次 → 兩個門檻都超 → 退階，而且【呢一次 poll 就要有數】。
  c.adv(1000)
  const v = r.poll()
  assert.ok(v, '退階嗰一刻就要有數字返，唔使再等下一個 request')
  assert.deepEqual([...v], [10, 20, 30, 40], '★ 要係同步路讀返嚟嘅新數，唔係 PBO 嘅舊數 ★')

  assert.equal(r.mode, 'sync-fallback')
  assert.equal(r.degraded, true)
  assert.equal(r.degradeReason, 'fence-stall')
  assert.equal(warns.length, 1, '退階要出聲，而且只出一次')
  assert.match(warns[0], /fence-stall/)
  assert.match(warns[0], /document\.hidden/)
  assert.equal(gl.liveSyncs.size, 0, '退階唔准漏 sync object')

  // ★ 退階之後一直行同步路，唔准每帧再試 fence ★
  const syncsBefore = gl.syncsCreated
  for (let frame = 0; frame < 30; frame++) {
    assert.equal(REQ(r), true)
    const w = r.poll()
    assert.ok(w, `frame ${frame}: 同步路每次 request 之後都要有數`)
    assert.deepEqual([...w], [10, 20, 30, 40])
    c.adv(16)
  }
  assert.equal(gl.syncsCreated, syncsBefore, '退階之後唔准再 fenceSync（否則每帧蝕 N 幀延遲）')
  assert.equal(gl.asyncReadPixels, 1, 'PBO 路只應該喺退階前落過一單')
  assert.equal(gl.syncReads, 31, '退階嗰下 1 次 + 之後 30 次')
  assert.equal(gl.packBinding, null, '同步 readPixels 嗰刻 PIXEL_PACK_BUFFER 一定要係 null')
})

test('WAIT_FAILED：唔准當成 timeout 無限等落去', () => {
  const gl = makeGL({ fenceMode: 'fail' })
  const c = clock()
  const warns = []
  const r = new AsyncPixelReader(gl, 4, { stallPolls: 12, stallMs: 1000, now: c.now, warn: (m) => warns.push(m) })

  assert.equal(REQ(r), true)
  const v = r.poll()      // ★ 第一次 poll 就要處理掉，唔係行 timeout 嗰條累積路 ★
  assert.ok(v, 'WAIT_FAILED 之後要即刻退階出數')
  assert.deepEqual([...v], [10, 20, 30, 40])
  assert.equal(r.mode, 'sync-fallback')
  assert.equal(r.degradeReason, 'wait-failed')
  assert.equal(r.inFlight, false, 'WAIT_FAILED 唔准留住 pending（留住就永遠唔再落單）')
  assert.equal(gl.liveSyncs.size, 0)
  assert.equal(warns.length, 1)
  assert.match(warns[0], /wait-failed/)
})

test('context lost：乾淨放手，唔漏 sync object', () => {
  const gl = makeGL({ fenceMode: 'never' })
  const c = clock()
  const r = new AsyncPixelReader(gl, 4, { now: c.now, warn: () => {} })

  assert.equal(REQ(r), true)
  assert.equal(gl.liveSyncs.size, 1)

  gl.contextLost = true
  assert.equal(r.poll(), null, 'context 冇咗就冇數')
  assert.equal(gl.liveSyncs.size, 0, '★ sync object 一定要放手 ★')
  assert.equal(gl.syncsDeleted, 1)
  assert.equal(r.inFlight, false)
  assert.equal(r.mode, 'async', 'context lost 唔係 fence 壞，唔應該賴落退階度')

  assert.equal(REQ(r), false, 'context 冇咗唔准落單')

  // 退階之後再 context lost：同步讀要失敗得乾淨（返 null，唔 throw）。
  gl.contextLost = false
  const r2 = new AsyncPixelReader(gl, 4, { stallPolls: 1, stallMs: 0, now: c.now, warn: () => {} })
  assert.equal(REQ(r2), true)
  c.adv(1)
  assert.ok(r2.poll())
  assert.equal(r2.mode, 'sync-fallback')
  gl.contextLost = true
  assert.equal(REQ(r2), false, '退階模式之下 context 冇咗一樣唔准落單')
  assert.equal(r2.poll(), null)

  r2.dispose()
  r.dispose()
  assert.equal(gl.liveSyncs.size, 0)
})

test('reset：退階之後重新試 async', () => {
  const gl = makeGL({ fenceMode: 'never' })
  const c = clock()
  const warns = []
  const r = new AsyncPixelReader(gl, 4, { stallPolls: 2, stallMs: 10, now: c.now, warn: (m) => warns.push(m) })

  assert.equal(REQ(r), true)
  assert.equal(r.poll(), null)
  c.adv(50)
  assert.ok(r.poll(), '門檻調細之後第 2 次 poll 就退階')
  assert.equal(r.mode, 'sync-fallback')
  assert.equal(warns.length, 1)

  // 換 context / 換 solver 之後：reset 推返 async。
  r.reset()
  assert.equal(r.mode, 'async')
  assert.equal(r.degraded, false)
  assert.equal(r.degradeReason, null)
  assert.equal(r.inFlight, false)

  // 模擬「新環境嘅 fence 正常」（context 復原）→ 一定要行返 PBO 路。
  gl.clientWaitSync = (s) => { s.waits++; return s.waits >= 2 ? GL_CONST.ALREADY_SIGNALED : GL_CONST.TIMEOUT_EXPIRED }
  const syncsBefore = gl.syncsCreated
  const syncReadsBefore = gl.syncReads
  assert.equal(REQ(r), true)
  assert.equal(gl.syncsCreated, syncsBefore + 1, 'reset 之後要重新落 fence')
  assert.equal(r.poll(), null)
  const v = r.poll()
  assert.deepEqual([...v], [1, 2, 3, 4], 'reset 之後要讀到 PBO 路嘅數')
  assert.equal(r.mode, 'async')
  assert.equal(gl.syncReads, syncReadsBefore, 'reset 之後唔應該再做同步讀')
  assert.equal(gl.liveSyncs.size, 0)

  // reset 清咗 warned：新環境再壞就要再出一次聲（新事實，唔係重複噪音）。
  gl.clientWaitSync = () => GL_CONST.TIMEOUT_EXPIRED
  assert.equal(REQ(r), true)
  assert.equal(r.poll(), null)
  c.adv(50)
  assert.ok(r.poll())
  assert.equal(warns.length, 2, 'reset 之後嘅第二次退階要再 warn 一次')
})

test('★ regression：退階唔准把同一個舊數當新數連續派出去 ★', () => {
  // 呢個係整件事嘅要害。收斂採樣器靠 poll() 返 null 分辨「今帧有冇新嘢」；
  // 如果退階之後 poll() 每次都返 out，採樣窗口就會塞滿同一個 Cd 然後宣布收斂 ——
  // 由「永遠冇數字」變成「一個假收斂」，仲差。
  const gl = makeGL({ fenceMode: 'never' })
  const c = clock()
  const r = new AsyncPixelReader(gl, 4, { stallPolls: 1, stallMs: 0, now: c.now, warn: () => {} })

  assert.equal(REQ(r), true)
  c.adv(1)
  assert.ok(r.poll(), '退階出第一個數')
  assert.equal(r.mode, 'sync-fallback')

  // 冇 request 就連問十次 —— 全部一定要 null。
  for (let i = 0; i < 10; i++) {
    assert.equal(r.poll(), null, `冇 request 之下第 ${i + 1} 次 poll 一定要係 null`)
  }

  // 一次 request 對一次新數，唔多唔少。
  gl.syncValue = [11, 21, 31, 41]
  assert.equal(REQ(r), true)
  const a = r.poll()
  assert.deepEqual([...a], [11, 21, 31, 41], '新 request 要讀到新數，唔係舊 out')
  assert.equal(r.poll(), null, '同一次 request 唔准派第二次')
  assert.equal(r.poll(), null)

  // cancel（換姿態／換零件）之後嗰個未執嘅數係上一個姿態嘅謊話，唔准派。
  gl.syncValue = [99, 99, 99, 99]
  assert.equal(REQ(r), true)
  r.cancel()
  assert.equal(r.poll(), null, '★ cancel 之後唔准派嗰個已讀未執嘅數 ★')

  // cancel 唔影響之後落單
  assert.equal(REQ(r), true)
  assert.ok(r.poll())
})

test('request 超出 buffer 容量：async 同 sync 兩條路都要擋', () => {
  const gl = makeGL({ fenceMode: 'never' })
  const c = clock()
  const r = new AsyncPixelReader(gl, 4, { stallPolls: 1, stallMs: 0, now: c.now, warn: () => {} })

  assert.equal(r.request(FB, 0, 0, 0, 2, 2), false, '2×2×4 = 16 float > 4')
  assert.equal(REQ(r), true)
  c.adv(1)
  assert.ok(r.poll())
  assert.equal(r.mode, 'sync-fallback')
  assert.equal(r.request(FB, 0, 0, 0, 2, 2), false, '退階之後一樣要擋')
  assert.equal(r.poll(), null, '被擋嘅 request 唔准算有新數')
})

test('readBuffer / framebuffer binding 喺兩條路都要還原', () => {
  const gl = makeGL({ fenceMode: 'never' })
  const c = clock()
  const r = new AsyncPixelReader(gl, 4, { stallPolls: 1, stallMs: 0, now: c.now, warn: () => {} })

  gl.readFbBinding = { id: 'someone-elses-fbo' }
  const prev = gl.readFbBinding
  assert.equal(r.request(FB, 1, 0, 0, 1, 1), true)
  assert.equal(gl.readFbBinding, prev, 'async 路要還原 READ_FRAMEBUFFER')
  assert.equal(gl.readBufferOf.get(FB), GL_CONST.COLOR_ATTACHMENT0, 'readBuffer 係 per-FBO state，要還原')

  c.adv(1)
  assert.ok(r.poll())
  assert.equal(gl.readFbBinding, prev, '同步路一樣要還原 READ_FRAMEBUFFER')
  assert.equal(gl.readBufferOf.get(FB), GL_CONST.COLOR_ATTACHMENT0)
})
