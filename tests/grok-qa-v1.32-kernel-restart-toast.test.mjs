/**
 * v1.32: eliminate spurious「内核已重启 — 模型已恢复到上一个成功状态」on known-good
 * Shell preview sequences (BX01/BX02).
 *
 * Root cause (verified): cadService watchdog started the per-call timeout at enqueue
 * time, not when the worker actually began the call. Shell/fillet both use
 * previewRound; stacked previews (debounce + param edits, or fillet→shell) burned
 * the 60s budget while queued → false timeout → terminate + recover toast — even
 * though rebuild/commit later finished CLEAN @v1.31.
 *
 * Fix: single-flight gate (timeout covers exclusive execution only) + previewRound
 * in LONG_METHODS (120s, same class as rebuild).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const serviceSrc = readFileSync(new URL('../src/cad/cadService.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.32+', () => {
  assert.match(version, /APP_VERSION = '1\.32'|APP_VERSION = '1\.[4-9]\d'/)
})

test('v1.32 wiring: previewRound is LONG + single-flight gate present', () => {
  assert.match(serviceSrc, /'previewRound'/)
  assert.match(serviceSrc, /单飞队列|gate/)
  assert.match(serviceSrc, /restartCount/)
  // LONG_METHODS must list previewRound near other long ops
  assert.match(serviceSrc, /LONG_METHODS = new Set\(\[[\s\S]*?'previewRound'[\s\S]*?\]\)/)
})

test('looksLikeKernelCrash: tight match, no false positive on business abort wording', async () => {
  const mod = await import(new URL('../src/cad/cadService.ts', import.meta.url).href)
  const { looksLikeKernelCrash } = mod
  assert.equal(looksLikeKernelCrash(new Error('Aborted(native code)')), true)
  assert.equal(looksLikeKernelCrash(new Error('unreachable executed')), true)
  assert.equal(looksLikeKernelCrash(new Error('Out of memory')), true)
  assert.equal(looksLikeKernelCrash(new Error('shell produced invalid solid')), false)
  assert.equal(looksLikeKernelCrash(new Error('user aborted preview')), false)
  assert.equal(looksLikeKernelCrash(new Error('内核已重启 — 模型已恢复到上一个成功状态')), false)
  assert.equal(looksLikeKernelCrash(new Error('operation memory hint')), false)
})

test('HARD: stacked slow previewRound must NOT restart when each run is under timeout', async () => {
  const mod = await import(new URL('../src/cad/cadService.ts', import.meta.url).href)
  const { createKernelProxy, KERNEL_RESTART_MSG } = mod

  const TIMEOUT = 80 // ms — exclusive-slot budget
  let live = null
  let term = 0
  const calls = []
  const spawnRaw = () => {
    const api = {
      // 50ms work — under TIMEOUT if exclusive; stacked-without-gate would kill call #2
      previewRound: async (tag) => {
        calls.push(tag)
        await new Promise((r) => setTimeout(r, 50))
        return { tag, triangles: [0, 1, 2] }
      },
      rebuild: async (feats) => ({ feats, triangles: [0, 1, 2] }),
    }
    const worker = {
      api,
      terminate: () => { term++; live = null },
      onError: () => {},
    }
    live = worker
    return worker
  }

  const k = createKernelProxy(spawnRaw, { defaultTimeout: TIMEOUT, longTimeout: TIMEOUT })
  const toasts = []
  k.onKernelRestart((m) => toasts.push(m))

  // Seed last-good so a spurious restart would emit the recover toast
  await k.proxy.rebuild([{ id: 'b', type: 'prim' }])

  const t0 = Date.now()
  // Fire three previews at once — mimics fillet preview still in flight + shell preview + thickness edit
  const p1 = k.proxy.previewRound('a')
  const p2 = k.proxy.previewRound('b')
  const p3 = k.proxy.previewRound('c')
  const [r1, r2, r3] = await Promise.all([p1, p2, p3])
  const elapsed = Date.now() - t0

  assert.equal(r1.tag, 'a')
  assert.equal(r2.tag, 'b')
  assert.equal(r3.tag, 'c')
  assert.deepEqual(calls, ['a', 'b', 'c'])
  assert.equal(k.getState().restartCount, 0, 'must not restart on stacked previews')
  assert.ok(!toasts.some((t) => /内核已重启/.test(t)), `no restart toast; got ${JSON.stringify(toasts)}`)
  assert.equal(term, 0)
  // Wall time ≈ 3×50ms serialized; without gate call #2/#3 would hit TIMEOUT while queued
  assert.ok(elapsed >= 140, `expected serialized ~150ms+, got ${elapsed}`)
  assert.ok(elapsed < 500, `unexpectedly slow ${elapsed}`)
  void KERNEL_RESTART_MSG
})

test('still restarts on true exclusive-slot hang', async () => {
  const mod = await import(new URL('../src/cad/cadService.ts', import.meta.url).href)
  const { createKernelProxy } = mod
  const TIMEOUT = 40
  let hang = true
  const spawnRaw = () => ({
    api: {
      previewRound: () => hang ? new Promise(() => {}) : Promise.resolve({ ok: 1 }),
      rebuild: async (feats) => ({ feats, triangles: [] }),
    },
    terminate: () => { hang = false },
    onError: () => {},
  })
  const k = createKernelProxy(spawnRaw, { defaultTimeout: TIMEOUT, longTimeout: TIMEOUT })
  const toasts = []
  k.onKernelRestart((m) => toasts.push(m))
  await k.proxy.rebuild([])
  await assert.rejects(() => k.proxy.previewRound('hang'), /内核已重启/)
  // allow recover to settle
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(k.getState().restartCount >= 1)
  assert.ok(toasts.some((t) => /内核已重启|几何内核崩溃/.test(t)))
})
