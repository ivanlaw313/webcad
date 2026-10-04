// BUG-506（P0 間歇性資料遺失）回歸測試
// ════════════════════════════════════════════════════════════════════════════
//
// 外部 QA（Grok bot，live v2.16）實測：MeshFit／FEA 之後成個模型靜默變空 ——
// Browser 實體（空）、特徵 (0)、時間軸空、狀態「就緒」，【冇任何錯誤、冇 toast】，
// Ctrl+Z 同 F5 都救唔返，檔案▾ 都冇恢復項。重現率 MeshFit 2/19、FEA 2/11。
//
// 根因（已證）：MeshFit 真係可以令 OCCT 內核崩潰 —— QA 11:40 嗰次 console 有紅字，
// 嗰次【有提示、模型保住】，走嘅係 restart()。restart() 三條分支全部有 notify。
// 但 silentRecoverAfterPreviewPreempt()【一條都冇】：佢 catch 到重放都崩潰之後，
// 靜靜開一個空內核就返回 —— UI 仍然以為自己有特徵。咁就係「模型自己冇咗」。
//
// ★ 呢個函數叫 silent 係有理由嘅 ★ 真良性搶佔（重放成功）必須維持靜默，否則用戶
// 每次按 Esc／Confirm 都食一個 toast。所以呢份測試兩邊都釘：成功=啞，失敗=大聲。
//
// 跑：node --experimental-strip-types --test tests/bug506-silent-model-clear.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const serviceSrc = readFileSync(new URL('../src/cad/cadService.ts', import.meta.url), 'utf8')
const load = () => import(new URL('../src/cad/cadService.ts', import.meta.url).href)

/** 可控內核：replayFails 決定重放（rebuild）係成功定崩潰。 */
function harness({ replayFails = false } = {}) {
  const st = { terminated: 0, spawned: 0, rebuilds: 0 }
  let seeded = false
  const spawnRaw = () => {
    st.spawned++
    return {
      api: {
        // 第一次 rebuild（種快照）一定要成功，之後嘅重放才受 replayFails 控制
        rebuild: async (feats) => {
          st.rebuilds++
          if (seeded && replayFails) throw new Error('Aborted(native code)')
          seeded = true
          return { feats, triangles: [] }
        },
        previewRound: () => new Promise(() => {}),   // 永遠唔完 = 掛住嘅預覽
        meshFit: () => new Promise(() => {}),
      },
      terminate: () => { st.terminated++ },
      onError: () => {},
    }
  }
  return { spawnRaw, st }
}

async function withPreemptedPreview(k) {
  const p = k.proxy.previewRound('x').catch(() => {})   // 會被 cancelPreviews 拒絕
  await new Promise((r) => setTimeout(r, 10))           // 等佔到 exclusive slot
  k.cancelPreviews()
  await new Promise((r) => setTimeout(r, 60))           // 等 recovering 做完
  await p
}

/* ── 1. 良性情況唔准變嘈 ──────────────────────────────────────────────── */

test('重放成功 = 真良性搶佔 → 一個 toast 都唔准出（唔好修 506 修到成日彈窗）', async () => {
  const { createKernelProxy } = await load()
  const { spawnRaw } = harness({ replayFails: false })
  const k = createKernelProxy(spawnRaw, { defaultTimeout: 200, longTimeout: 200 })
  const ev = []
  k.onKernelRestart((msg, kind) => ev.push({ msg, kind }))
  await k.proxy.rebuild([{ id: 'b', type: 'prim' }])    // 種快照
  await withPreemptedPreview(k)
  assert.deepEqual(ev, [], `良性搶佔要靜默，實得 ${JSON.stringify(ev)}`)
  assert.equal(k.getState().restartCount, 0, '良性搶佔唔算一次重啟')
  assert.equal(k.getState().hasSnapshot, true, '快照要仲在（模型冇遺失）')
})

/* ── 2. ★ BUG-506 本體 ★ ─────────────────────────────────────────────── */

test('★ BUG-506：重放都崩潰 → 內核變空，一定要出聲（原本完全靜默）★', async () => {
  const { createKernelProxy } = await load()
  const { spawnRaw } = harness({ replayFails: true })
  const k = createKernelProxy(spawnRaw, { defaultTimeout: 200, longTimeout: 200 })
  const ev = []
  k.onKernelRestart((msg, kind) => ev.push({ msg, kind }))
  await k.proxy.rebuild([{ id: 'b', type: 'prim' }])
  await withPreemptedPreview(k)

  assert.ok(ev.length >= 1, '★ 模型冇咗嘅時候一個字都唔講，就係 QA 報嘅「靜默清空」★')
  const lost = ev.find((e) => e.kind === 'lost')
  assert.ok(lost, `要用 kind='lost' 報，UI 才分得出「恢復到上一個狀態」同「冇咗」，實得 ${JSON.stringify(ev)}`)
  assert.match(lost.msg, /恢復自動存檔/, '要同時話返用戶點救（檔案▾ → 恢復自動存檔）')
  assert.equal(k.getState().hasSnapshot, false, '快照要棄掉，否則下次重放又死 → 無限重啟迴圈')
})

test('冇快照可重放（新內核係空嘅）→ 都要報 lost，交畀 UI 對照自己有幾多特徵', async () => {
  const { createKernelProxy } = await load()
  const { spawnRaw } = harness()
  const k = createKernelProxy(spawnRaw, { defaultTimeout: 200, longTimeout: 200 })
  const ev = []
  k.onKernelRestart((msg, kind) => ev.push({ msg, kind }))
  await withPreemptedPreview(k)                          // 冇 rebuild 過 = 冇快照
  assert.ok(ev.some((e) => e.kind === 'lost'), `實得 ${JSON.stringify(ev)}`)
})

/* ── 3. restart() 三條分支嘅 kind 要分得清 ───────────────────────────── */

test('restart()：重放成功 → recovered；重放崩潰 → lost', async () => {
  const { createKernelProxy } = await load()
  for (const replayFails of [false, true]) {
    const { spawnRaw } = harness({ replayFails })
    const k = createKernelProxy(spawnRaw, { defaultTimeout: 40, longTimeout: 40 })
    const ev = []
    k.onKernelRestart((msg, kind) => ev.push({ msg, kind }))
    await k.proxy.rebuild([{ id: 'b', type: 'prim' }])
    await assert.rejects(() => k.proxy.meshFit('x'), /內核已重啟|内核已重启/)
    await new Promise((r) => setTimeout(r, 80))
    const kinds = ev.map((e) => e.kind)
    assert.ok(kinds.includes('info'), '崩潰嗰下要即時出聲（唔好等重放完）')
    assert.ok(kinds.includes(replayFails ? 'lost' : 'recovered'),
      `replayFails=${replayFails} 實得 ${JSON.stringify(ev)}`)
  }
})

/* ── 4. 文案／守衛嘅結構性陷阱 ──────────────────────────────────────── */

test('★ 良性守衛一定要兩種字體都認 —— 否則改文案就會造成重啟迴圈 ★', async () => {
  const { looksLikeKernelCrash, KERNEL_RESTART_MSG } = await load()
  // 自己發出嘅重啟訊息再傳返入嚟，唔可以當成「又一次崩潰」。
  assert.equal(looksLikeKernelCrash(new Error(KERNEL_RESTART_MSG)), false, '繁體要認')
  assert.equal(looksLikeKernelCrash(new Error('内核已重启（上次操作令几何内核崩溃）')), false,
    '簡體舊文案一樣要認 —— 舊 bundle／舊測試／快取都仲會帶住簡體字串')
  assert.equal(looksLikeKernelCrash(new Error('kernel restart')), false)
  // 真崩潰唔准被守衛放過
  assert.equal(looksLikeKernelCrash(new Error('Aborted(native code)')), true)
})

test('toast 文案要繁體（BUG-511 同類：QA 報 console 紅字係簡體）', () => {
  const msgs = serviceSrc.match(/notify\(\s*[`'"][^`'"]+/g) ?? []
  assert.ok(msgs.length >= 4, '搵唔到 notify 文案，實得 ' + msgs.length)
  for (const m of msgs) {
    // ★ 只准放「簡體獨有」嘅字 ★ 崩（繁簡同形）曾經誤報自己嘅合法文案 ——
    // 同 zh-hk-no-sc-leak 嗰個 面／件 誤報一模一樣：擴字集之前要確認唔係共用字。
    assert.ok(!/[内几复启溃统阵圆]/.test(m), `notify 文案夾咗簡體字：${m}`)
  }
})

/* ── BUG-516 / BUG-527（v2.17 QA 回報）──────────────────────────────────── */

test('★ BUG-516：rebuild([]) 成功唔等於恢復成功 —— 要報返重放咗幾個特徵 ★', async () => {
  const { createKernelProxy } = await load()
  const { spawnRaw } = harness()
  const k = createKernelProxy(spawnRaw, { defaultTimeout: 40, longTimeout: 40 })
  const ev = []
  k.onKernelRestart((msg, kind, info) => ev.push({ kind, info }))
  await k.proxy.rebuild([])                      // 空文件 = 合法好狀態 → 快照 = []
  await assert.rejects(() => k.proxy.meshFit('x'), /內核已重啟|内核已重启/)
  await new Promise((r) => setTimeout(r, 80))
  const rec = ev.find((e) => e.kind === 'recovered')
  assert.ok(rec, '要有 recovered 事件，實得 ' + JSON.stringify(ev))
  assert.equal(rec.info?.replayed, 0,
    '★ 一定要講明重放咗 0 個 —— 否則 store 冇可能知道「已恢復」其實係假話 ★')
})

test('重放到真實特徵嘅時候，replayed 要等於快照大小', async () => {
  const { createKernelProxy } = await load()
  const { spawnRaw } = harness()
  const k = createKernelProxy(spawnRaw, { defaultTimeout: 40, longTimeout: 40 })
  const ev = []
  k.onKernelRestart((msg, kind, info) => ev.push({ kind, info }))
  await k.proxy.rebuild([{ id: 'a', type: 'prim' }, { id: 'b', type: 'prim' }])
  await assert.rejects(() => k.proxy.meshFit('x'), /內核已重啟|内核已重启/)
  await new Promise((r) => setTimeout(r, 80))
  assert.equal(ev.find((e) => e.kind === 'recovered')?.info?.replayed, 2)
})

test('崩潰一發現就要出聲（info），唔准等重放完 —— 重放可能要幾十秒', async () => {
  const { createKernelProxy } = await load()
  const { spawnRaw } = harness()
  const k = createKernelProxy(spawnRaw, { defaultTimeout: 40, longTimeout: 40 })
  const order = []
  k.onKernelRestart((msg, kind) => order.push(kind))
  await k.proxy.rebuild([{ id: 'a', type: 'prim' }])
  await assert.rejects(() => k.proxy.meshFit('x'), /內核已重啟|内核已重启/)
  assert.equal(order[0], 'info', '第一個事件要係 info，實得 ' + JSON.stringify(order))
})

/* ── BUG-527：通知通道（source-scan，固定字串）─────────────────────────── */

test('★ BUG-527：崩潰通知唔准只寫狀態列（下一句成功操作會蓋走）★', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.ok(store.includes('kernelNotice'),
    '★ 冇獨立通知通道 —— QA 實測三次內核崩潰畫面零提示，因為狀態列即刻被「已切割（布爾減）」蓋走 ★')
  assert.ok(store.includes('dismissKernelNotice'), '通知要用戶自己關，唔可以自動消失')
  const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
  assert.ok(ribbon.includes('data-testid="kernel-notice"'), '通知要真係畫出嚟')
})

test('★ BUG-506/425：載入大檔只重建到一部分，唔准報「已打開項目」★', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.ok(store.includes('打開未完成'),
    '★ 檔案有 222 個特徵但只重建到 0 個，舊版照報「已打開項目（0 活動特徵）」★')
  assert.equal(store.includes("statusVerb = '已打开项目'"), false, '預設文案要繁體')
})
