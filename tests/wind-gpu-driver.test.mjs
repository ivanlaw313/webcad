// wind-fix 回归（GPU 风洞，headless 可测嘅部分）：
//   ① 0% 永远唔郁：CPU 跑完 windMode=0（面板靠结果继续显示），再拣 GPU → driver 见 windMode===0 永远暂停。
//   ② 「WebGL: INVALID_ENUM: texParameter」：three WebGL3DRenderTarget(count>1) 第 2 张 attachment 冇 wrapR。
//   ③ 冇 WebGL2 → probeMRT 出 ok=false + 原因（WindTunnelGpu 据此自动切返 CPU 并讲原因）。
// 跑法：node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/wind-gpu-driver.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { ClampToEdgeWrapping, HalfFloatType, LinearFilter, RGBAFormat, WebGL3DRenderTarget } from 'three'
import { gpuDriverShouldPause } from '../src/analysis/lbm/convergence.ts'
import { fixMrt3DWrapR } from '../src/analysis/lbm/lbmGpu.ts'
import { probeMRT } from '../src/analysis/lbm/probeMRT.ts'

test('driver keeps stepping while it owns a run even if windMode was reset to 0 by a previous CPU run', () => {
  // 用户报嘅场景：CPU 跑完（windMode=0，面板靠 windResult 显示）→ 拣 GPU → 撳运行
  assert.equal(gpuDriverShouldPause({ windMode: 0, owningRun: true, hidden: false }), false)
  // 面板真系閂咗、冇 run → 暂停（慳帧预算，原设计）
  assert.equal(gpuDriverShouldPause({ windMode: 0, owningRun: false, hidden: false }), true)
  assert.equal(gpuDriverShouldPause({ windMode: 1, owningRun: false, hidden: false }), false)
  // tab 唔见人 → 一律暂停
  assert.equal(gpuDriverShouldPause({ windMode: 1, owningRun: true, hidden: true }), true)
})

test('WebGL3DRenderTarget(count:2): second attachment lacks wrapR (INVALID_ENUM root cause) and fixMrt3DWrapR repairs it', () => {
  const rt = new WebGL3DRenderTarget(4, 4, 4, {
    count: 2, type: HalfFloatType, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter,
    wrapS: ClampToEdgeWrapping, wrapT: ClampToEdgeWrapping, wrapR: ClampToEdgeWrapping,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  })
  assert.equal(rt.textures.length, 2)
  assert.equal(rt.textures[0].wrapR, ClampToEdgeWrapping)
  assert.equal(rt.textures[1].wrapR, undefined, 'three leaves attachment #1 without wrapR → texParameteri(WRAP_R, undefined)')
  assert.equal(fixMrt3DWrapR(rt), 1)
  assert.equal(rt.textures[1].wrapR, ClampToEdgeWrapping)
  assert.equal(fixMrt3DWrapR(rt), 0, 'idempotent')
})

test('no WebGL2 → capability probe reports not-ok with a reason (driver falls back to CPU with that message)', () => {
  const r = probeMRT(null)
  assert.equal(r.ok, false)
  assert.equal(r.force7, false)
  assert.match(r.reason, /CPU/)
})
