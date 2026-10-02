// BUG-406（P0 資料遺失）回歸測試
// ═══════════════════════════════════════════════════════════════════════════
//
// 外部 QA（Grok bot，live v2.15）實測：閂晒所有 WebCAD 分頁再開，未儲存嘅工作
// 永久消失 —— 冇還原、冇提示、F5 救唔返、版本歷史都救唔返。重現 2/2。
//
// 根因：writeTabAutosaveRaw() 正常只寫 sessionStorage，而 sessionStorage 嘅壽命
// 等於「分頁瀏覽 session」。閂晒分頁 → 連 TAB_ID_KEY 一齊消失 → 新分頁抽新 tabId
// → readTabAutosaveRaw() 三條路全部 miss → 存檔變成永遠搵唔到嘅孤兒。
//
// ★ 呢個 bug 係「修 A 製造 B」★ —— tab 隔離本來係為咗修 BUG-276（新分頁靜靜
// 還原咗另一個分頁嘅文件）。所以修 BUG-406 嘅時候【唔可以】變返自動載入，
// 否則 BUG-276 會翻兜。正確做法：孤兒要【列得出、恢復得到】，但唔自動載入。
//
// 跑：node --experimental-strip-types --import ./tests/register-resolver.mjs --test tests/autosave-recovery.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

/* ── 假 storage（可以模擬配額爆同「閂晒分頁」）────────────────────────── */
function makeStorage({ quota = Infinity } = {}) {
  const m = new Map()
  return {
    _m: m,
    get length() { return m.size },
    key(i) { return [...m.keys()][i] ?? null },
    getItem(k) { return m.has(k) ? m.get(k) : null },
    setItem(k, v) {
      const next = [...m.entries()].reduce((n, [a, b]) => n + a.length + b.length, 0)
        - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + String(v).length
      if (next > quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e }
      m.set(k, String(v))
    },
    removeItem(k) { m.delete(k) },
    clear() { m.clear() },
  }
}

async function freshModule({ sessionQuota, localQuota } = {}) {
  globalThis.sessionStorage = makeStorage({ quota: sessionQuota })
  globalThis.localStorage = makeStorage({ quota: localQuota })
  // cache-bust：每個 test 要一個乾淨 module（getTabSessionId 讀 sessionStorage，冇模組級 cache，但保險）
  return await import('../src/runtime/tabDocumentSession.ts?t=' + Math.random())
}

/** 模擬「閂晒所有分頁」：sessionStorage 整個消失，localStorage 留住。 */
function closeAllTabs() {
  globalThis.sessionStorage = makeStorage()
}

const doc = (n) => JSON.stringify({ projectName: n, features: [1, 2, 3], _x: 'x'.repeat(50) })

test('對照：同一分頁 F5 —— sessionStorage 嗰份照還原（原本行為唔准變）', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc('盒A'), { name: '盒A', features: 3 })
  assert.equal(M.readTabAutosaveRaw(), doc('盒A'))
})

test('★ BUG-406：閂晒分頁再開 —— 舊工作一定要列得出嚟恢復 ★', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc('盒A'), { name: '盒A', features: 3 })
  const before = M.readTabAutosaveRaw()
  assert.ok(before, '前置條件：寫得入')

  closeAllTabs()                                   // ← QA 嗰個動作

  // 新分頁：自己冇存檔（呢點維持原狀，唔可以自動載入別人嘅）
  assert.equal(M.readTabAutosaveRaw(), null, '新分頁唔應該靜靜還原（否則 BUG-276 翻兜）')

  // ★ 但一定要恢復得到 ★
  const rec = M.listRecoverableAutosaves()
  assert.equal(rec.length, 1, '閂晒分頁之後舊存檔仲要搵得返，而唔係永久消失')
  assert.equal(M.readRecoverableAutosave(rec[0].tabId), before, '恢復出嚟嘅內容要同原本逐字一樣')
})

test('★ 恢復清單要有內容標示（QA 報過 entry 分唔清邊個模型）★', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc('托架'), { name: '托架', features: 7, bodies: 2 })
  closeAllTabs()
  const [r] = M.listRecoverableAutosaves()
  assert.match(r.label, /托架/, '要見到文件名')
  assert.match(r.label, /7 特徵/, '要見到特徵數')
  assert.match(r.label, /2 實體/, '要見到實體數')
  assert.ok(r.ts > 0 && r.bytes > 0)
})

test('冇名嘅文件都要有一個睇得明嘅標籤', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc(''), { features: 0 })
  closeAllTabs()
  const [r] = M.listRecoverableAutosaves()
  assert.match(r.label, /未命名零件/)
})

test('★ 並存分頁唔可以互相自動載入（BUG-276 唔准翻兜）★', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc('分頁1'), { name: '分頁1', features: 1 })
  // 另一個分頁：新 session，但 localStorage 共用
  globalThis.sessionStorage = makeStorage()
  assert.equal(M.readTabAutosaveRaw(), null, '第二個分頁一定要乾淨開局')
  M.writeTabAutosaveRaw(doc('分頁2'), { name: '分頁2', features: 2 })
  assert.equal(M.readTabAutosaveRaw(), doc('分頁2'), '各自保住自己嗰份')
  // 恢復清單唔應該包自己
  const rec = M.listRecoverableAutosaves()
  assert.ok(!rec.some((r) => r.meta.name === '分頁2'), '恢復清單唔應該列自己')
  assert.ok(rec.some((r) => r.meta.name === '分頁1'), '但要列得到另一個分頁嗰份')
})

test('孤兒數量有上限，而且永遠唔會剪走自己嗰份', async () => {
  const M = await freshModule()
  for (let i = 1; i <= 6; i++) {
    globalThis.sessionStorage = makeStorage()
    M.writeTabAutosaveRaw(doc('T' + i), { name: 'T' + i, features: i })
  }
  // 最後一個分頁自己嗰份一定仍然讀得到
  assert.equal(M.readTabAutosaveRaw(), doc('T6'), '★ 寫完唔可以被自己嘅剪枝剪走 ★')
  const rec = M.listRecoverableAutosaves()
  assert.ok(rec.length <= 3, '孤兒上限 3，實得 ' + rec.length)
  assert.ok(rec.length >= 1, '剪得太狠就失去恢復能力')
  // 保留嘅要係最新嘅
  assert.equal(rec[0].meta.name, 'T5', '最新嘅孤兒排最前')
})

test('localStorage 配額爆 —— 鏡像失敗唔可以連正常存檔都搞死', async () => {
  const M = await freshModule({ localQuota: 40 })      // 細到一定寫唔入
  assert.doesNotThrow(() => M.writeTabAutosaveRaw(doc('盒'), { name: '盒', features: 1 }),
    '★ 恢復副本係額外保險，寫唔入都唔准掟 ★')
  assert.equal(M.readTabAutosaveRaw(), doc('盒'), 'sessionStorage 嗰份要照樣有效（F5 仲救得返）')
})

test('索引同實體唔同步（blob 冇咗）→ 當冇，唔好報一個開唔到嘅 entry', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc('X'), { name: 'X', features: 1 })
  closeAllTabs()
  const [r] = M.listRecoverableAutosaves()
  globalThis.localStorage.removeItem('webcad-autosave:' + r.tabId)
  assert.equal(M.listRecoverableAutosaves().length, 0, '搵唔到 blob 就唔好列出嚟')
})

test('用戶明確丟棄 → blob 同索引都要清', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc('Y'), { name: 'Y', features: 1 })
  closeAllTabs()
  const [r] = M.listRecoverableAutosaves()
  M.dropRecoverableAutosave(r.tabId)
  assert.equal(M.listRecoverableAutosaves().length, 0)
  assert.equal(M.readRecoverableAutosave(r.tabId), null)
})

test('File → 新建 只清自己，唔准清走別人嘅恢復副本', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc('舊'), { name: '舊', features: 4 })
  closeAllTabs()
  M.writeTabAutosaveRaw(doc('新'), { name: '新', features: 1 })
  const n = M.listRecoverableAutosaves().length
  M.clearTabAutosave()
  assert.equal(M.readTabAutosaveRaw(), null, '自己嗰份要清走')
  assert.equal(M.listRecoverableAutosaves().length, n, '★ 別人嘅恢復副本唔准被 File→新建 清走 ★')
})

/* ── BUG-510：手動開清單要包本分頁，而且要分得出邊份最新 ─────────────── */

test('★ BUG-510：includeSelf 之下一定要見到本分頁自己嗰份（最新改動通常就喺度）★', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc('舊分頁'), { name: '舊分頁', features: 2 })
  closeAllTabs()
  M.writeTabAutosaveRaw(doc('本分頁最新'), { name: '本分頁最新', features: 9 })

  const auto = M.listRecoverableAutosaves()                    // 啟動自動提示：排除本分頁
  assert.ok(!auto.some((r) => r.meta.name === '本分頁最新'), '自動提示唔應該提本分頁（會嘈）')

  const manual = M.listRecoverableAutosaves({ includeSelf: true })   // 手動開清單：要包
  const self = manual.find((r) => r.meta.name === '本分頁最新')
  assert.ok(self, '★ 手動清單一定要包本分頁 —— 否則用戶最想救嘅最新改動根本唔喺清單 ★')
  assert.equal(self.isSelf, true, '要標明係本分頁，免得用戶以為揀錯')
  assert.equal(manual[0].meta.name, '本分頁最新', '最新嗰份要排第一（預設揀中嘅就係佢）')
})

test('★ BUG-510：清單排序一定要係真‧最新排前（唔可以靠時鐘精度）★', async () => {
  const M = await freshModule()
  for (const n of ['a', 'b', 'c']) {
    globalThis.sessionStorage = makeStorage()
    M.writeTabAutosaveRaw(doc(n), { name: n, features: 1 })
  }
  const l = M.listRecoverableAutosaves({ includeSelf: true })
  assert.deepEqual(l.map((r) => r.meta.name), ['c', 'b', 'a'],
    '同一毫秒連寫都要靠 seq 分得出新舊 —— QA 實測舊版會還原出較早嘅模型')
})

test('每份副本要有相對時間（QA：冇時間、分唔到邊份）', async () => {
  const M = await freshModule()
  M.writeTabAutosaveRaw(doc('X'), { name: 'X', features: 1 })
  closeAllTabs()
  const [r] = M.listRecoverableAutosaves()
  assert.match(r.age, /秒前|分鐘前|小時/, '要有人話時間，實得：' + r.age)
})

test('formatRecoveryAge：秒 / 分 / 小時 都講得出', async () => {
  const M = await freshModule()
  const now = 1_000_000_000_000
  assert.match(M.formatRecoveryAge(now - 5_000, now), /^5 秒前$/)
  assert.match(M.formatRecoveryAge(now - 180_000, now), /^3 分鐘前$/)
  assert.match(M.formatRecoveryAge(now - 7_500_000, now), /^2 小時/)
})
