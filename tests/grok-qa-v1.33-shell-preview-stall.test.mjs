/**
 * v1.33: BX01 Shell preview must not stall Confirm (LIVE @1.32).
 *
 * Root cause: Confirm gated on shellPreviewBusy + v1.32 single-flight held
 * previewRound until 120s watchdog. Esc bumped UI seq but did not cancel the
 * worker call, so retry queued behind the hung exclusive slot. restartCount
 * stayed 0 because the user cancelled well under 120s.
 *
 * Fix: ungated Confirm (picks + t>0); silent preview preempt so rebuild/Esc
 * release the slot without「内核已重启」toast; keep v1.32 exclusive-timeout
 * watchdog semantics.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const serviceSrc = readFileSync(new URL('../src/cad/cadService.ts', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.33+', () => {
  assert.match(version, /APP_VERSION = '1\.3[3-9]'|APP_VERSION = '1\.[4-9]\d'/)
})

test('v1.33 wiring: Confirm ungated + silent preview preempt', () => {
  assert.match(viewport, /okDisabled=\{!shellPicks\.length \|\| !\(shellThickness > 0\)\}/)
  assert.doesNotMatch(viewport, /okDisabled=\{!shellPicks\.length \|\| !\(shellThickness > 0\) \|\| shellPreviewBusy/)
  assert.match(serviceSrc, /PREVIEW_CANCELLED_MSG/)
  assert.match(serviceSrc, /function cancelPreviews/)
  assert.match(serviceSrc, /PRIORITY_METHODS/)
  assert.match(serviceSrc, /silentRecoverAfterPreviewPreempt/)
  assert.match(storeSrc, /cancelPreviews\(\)/)
  assert.match(storeSrc, /commitShell: async/)
  // Esc / Confirm both bump seq and cancel kernel preview
  const cancelIdx = storeSrc.indexOf('cancelShell: () => {')
  assert.ok(cancelIdx > 0)
  assert.match(storeSrc.slice(cancelIdx, cancelIdx + 800), /cancelPreviews\(\)/)
  assert.match(storeSrc.slice(cancelIdx, cancelIdx + 800), /已取消抽壳/)
  const commitIdx = storeSrc.indexOf('commitShell: async')
  assert.match(storeSrc.slice(commitIdx, commitIdx + 1600), /cancelPreviews\(\)/)
})

test('looksLikeKernelCrash: preview cancelled is not a crash', async () => {
  const mod = await import(new URL('../src/cad/cadService.ts', import.meta.url).href)
  const { looksLikeKernelCrash, isPreviewCancelled, PREVIEW_CANCELLED_MSG } = mod
  assert.equal(isPreviewCancelled(new Error(PREVIEW_CANCELLED_MSG)), true)
  assert.equal(looksLikeKernelCrash(new Error(PREVIEW_CANCELLED_MSG)), false)
  assert.equal(looksLikeKernelCrash(new Error('Aborted(native code)')), true)
})

test('HARD: hung previewRound must not block rebuild; no restart toast', async () => {
  const mod = await import(new URL('../src/cad/cadService.ts', import.meta.url).href)
  const { createKernelProxy } = mod
  const TIMEOUT = 200
  let term = 0
  let previewCalls = 0
  let rebuildCalls = 0
  const spawnRaw = () => {
    let n = 0
    return {
      api: {
        previewRound: () => { previewCalls++; return new Promise(() => {}) },
        rebuild: async (feats) => { rebuildCalls++; return { feats, triangles: [0, 1, 2], tag: `r${++n}` } },
      },
      terminate: () => { term++ },
      onError: () => {},
    }
  }
  const k = createKernelProxy(spawnRaw, { defaultTimeout: TIMEOUT, longTimeout: TIMEOUT })
  const toasts = []
  k.onKernelRestart((m) => toasts.push(m))
  await k.proxy.rebuild([{ id: 'seed', type: 'prim' }])
  const hung = k.proxy.previewRound([{ id: 'pv', type: 'shell' }])
  await new Promise((r) => setTimeout(r, 20))
  const t0 = Date.now()
  const committed = await k.proxy.rebuild([{ id: 'seed', type: 'prim' }, { id: 'shell', type: 'shell' }])
  const elapsed = Date.now() - t0
  await assert.rejects(() => hung, /preview cancelled/)
  assert.equal(committed.triangles.length, 3)
  assert.equal(k.getState().restartCount, 0, 'silent preempt must not count as kernel restart')
  assert.ok(!toasts.some((t) => /内核已重启/.test(t)), `no restart toast; got ${JSON.stringify(toasts)}`)
  assert.ok(elapsed < 150, `rebuild should preempt hung preview quickly, got ${elapsed}ms`)
  assert.ok(term >= 1, 'hung worker must be terminated')
  assert.ok(rebuildCalls >= 2)
  void previewCalls
})

test('HARD: cancelPreviews releases slot so the next preview can run', async () => {
  const mod = await import(new URL('../src/cad/cadService.ts', import.meta.url).href)
  const { createKernelProxy } = mod
  const TIMEOUT = 200
  let allow = false
  const spawnRaw = () => ({
    api: {
      previewRound: async (tag) => {
        if (!allow) return new Promise(() => {})
        return { tag, triangles: [0, 1, 2] }
      },
      rebuild: async (feats) => ({ feats, triangles: [] }),
    },
    terminate: () => { allow = true },
    onError: () => {},
  })
  const k = createKernelProxy(spawnRaw, { defaultTimeout: TIMEOUT, longTimeout: TIMEOUT })
  await k.proxy.rebuild([])
  const hung = k.proxy.previewRound('old')
  await new Promise((r) => setTimeout(r, 15))
  k.cancelPreviews()
  await assert.rejects(() => hung, /preview cancelled/)
  const next = await k.proxy.previewRound('fresh')
  assert.equal(next.tag, 'fresh')
  assert.equal(k.getState().restartCount, 0)
})

test('v1.32 still holds: stacked slow previews do not restart', async () => {
  const mod = await import(new URL('../src/cad/cadService.ts', import.meta.url).href)
  const { createKernelProxy } = mod
  const TIMEOUT = 80
  const calls = []
  const spawnRaw = () => ({
    api: {
      previewRound: async (tag) => {
        calls.push(tag)
        await new Promise((r) => setTimeout(r, 50))
        return { tag, triangles: [0, 1, 2] }
      },
      rebuild: async (feats) => ({ feats, triangles: [0, 1, 2] }),
    },
    terminate: () => {},
    onError: () => {},
  })
  const k = createKernelProxy(spawnRaw, { defaultTimeout: TIMEOUT, longTimeout: TIMEOUT })
  await k.proxy.rebuild([{ id: 'b', type: 'prim' }])
  const [r1, r2, r3] = await Promise.all([
    k.proxy.previewRound('a'),
    k.proxy.previewRound('b'),
    k.proxy.previewRound('c'),
  ])
  assert.equal(r1.tag, 'a')
  assert.equal(r2.tag, 'b')
  assert.equal(r3.tag, 'c')
  assert.deepEqual(calls, ['a', 'b', 'c'])
  assert.equal(k.getState().restartCount, 0)
})

test('true exclusive hang on rebuild still restarts + recover toast', async () => {
  const mod = await import(new URL('../src/cad/cadService.ts', import.meta.url).href)
  const { createKernelProxy } = mod
  const TIMEOUT = 40
  let hang = true
  const spawnRaw = () => ({
    api: {
      rebuild: (feats) => hang && feats?.length ? new Promise(() => {}) : Promise.resolve({ feats, triangles: [] }),
    },
    terminate: () => { hang = false },
    onError: () => {},
  })
  const k = createKernelProxy(spawnRaw, { defaultTimeout: TIMEOUT, longTimeout: TIMEOUT })
  const toasts = []
  k.onKernelRestart((m) => toasts.push(m))
  await k.proxy.rebuild([])
  await assert.rejects(() => k.proxy.rebuild([{ id: 'x', type: 'prim' }]), /内核已重启/)
  await new Promise((r) => setTimeout(r, 30))
  assert.ok(k.getState().restartCount >= 1)
  assert.ok(toasts.some((t) => /内核已重启|几何内核崩溃/.test(t)))
})
