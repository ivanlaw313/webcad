// BUG-515（P1）回歸測試：螺栓孔圈跨新檔殘留 + 預覽 ≠ 結果
// ════════════════════════════════════════════════════════════════════════════
//
// 外部 QA（Grok bot，live v2.16）實測：
//   1. 舊檔開過「螺栓孔圈 數量 100（夾到 64）」→ 檔案▾ 新建 → Box 80×40×20
//      → 孔 Ø12 貫通 → 【預覽只得一個 Ø12】→ 確定 → 「已鑽 64 個螺栓孔」，
//      件變成大環形切口。用戶係信預覽落刀嘅，呢個直接造錯件。
//   2. 嗰個 checkbox 要捲到對話框底先見到，所以用戶根本唔知自己開住。
//
// 根因兩層：
//   · reset()（新建）清咗 holeMode/holePos，但冇清 holeBoltCircle/BcCount/BcPcd
//   · 圓心同夾取【兩邊各自計一次】—— store 嘅 holeCommit 一份、SketchLayer 嘅
//     HolePreview 一份。只要有一邊唔同步，預覽就同結果唔同。
//
// 修法：抽 src/cad/boltCircle.ts 做唯一來源，兩邊都行佢 → 「飄」喺結構上唔可能。
//
// 跑：node --experimental-strip-types --test tests/bug515-bolt-circle-sticky.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BOLT_COUNT_MAX, BOLT_COUNT_MIN,
  boltCircleCenters, boltCircleCount, boltCircleRadius,
} from '../src/cad/boltCircle.ts'

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8')

/* ── 夾取 ──────────────────────────────────────────────────────────────── */

test('孔數夾取：QA 打 100 要夾到 64（唔好靜靜當 100 咁鑽）', () => {
  assert.equal(boltCircleCount(100), BOLT_COUNT_MAX)
  assert.equal(boltCircleCount(64), 64)
  assert.equal(boltCircleCount(2), BOLT_COUNT_MIN)
  assert.equal(boltCircleCount(1), BOLT_COUNT_MIN, '1 個孔唔算圈')
  assert.equal(boltCircleCount(-5), BOLT_COUNT_MIN)
})

test('孔數夾取：0 / NaN → 預設 4（唔准變 0 個孔即係乜都唔鑽）', () => {
  assert.equal(boltCircleCount(0), 4)
  assert.equal(boltCircleCount(NaN), 4)
  assert.equal(boltCircleCount(6.4), 6, '小數四捨五入')
})

test('節圓半徑：PCD/2，但唔准細到變同心重疊', () => {
  assert.equal(boltCircleRadius(50), 25)
  assert.equal(boltCircleRadius(0), 0.5)
  assert.equal(boltCircleRadius(-10), 0.5)
})

/* ── 幾何 ──────────────────────────────────────────────────────────────── */

test('圓心：數量正確、全部落喺節圓上、第 0 個喺 +X', () => {
  const cs = boltCircleCenters(10, 20, 8, 50)
  assert.equal(cs.length, 8)
  for (const [x, y] of cs) {
    assert.ok(Math.abs(Math.hypot(x - 10, y - 20) - 25) < 1e-9, `(${x},${y}) 唔喺 PCD Ø50 上`)
  }
  assert.deepEqual(cs[0], [35, 20], '第 0 個固定 +X —— 次序唔准變，特徵樹重放要逐個對得上')
})

test('均布：相鄰夾角全部一樣', () => {
  const n = 7
  const cs = boltCircleCenters(0, 0, n, 40)
  const ang = cs.map(([x, y]) => Math.atan2(y, x))
  const step = cs.map((_, i) => {
    let d = ang[(i + 1) % n] - ang[i]
    while (d <= 0) d += Math.PI * 2
    return d
  })
  for (const d of step) assert.ok(Math.abs(d - (Math.PI * 2) / n) < 1e-9, `夾角不均：${d}`)
})

test('圓心冇重複（重複 = OCCT 會收到同位置兩個切除）', () => {
  const cs = boltCircleCenters(0, 0, BOLT_COUNT_MAX, 50)
  const keys = new Set(cs.map(([x, y]) => `${x.toFixed(9)},${y.toFixed(9)}`))
  assert.equal(keys.size, BOLT_COUNT_MAX)
})

/* ── ★ 核心：預覽同結果唔准再各自計 ★ ──────────────────────────────── */

test('★ BUG-515：預覽同 commit 兩邊都唔准自己寫夾取／三角函數 ★', () => {
  for (const f of ['src/store.ts', 'src/components/SketchLayer.tsx']) {
    const src = read(f)
    assert.match(src, /from '\.{1,2}\/(cad\/)?boltCircle'/, `${f} 要 import 共用模組`)
    // 舊嗰兩份自己計嘅 clamp：Math.min(64, ... ) 配 Math.round(...BcCount)
    assert.equal(/Math\.min\(64,\s*Math\.round\([^)]*Bc?C?ount/.test(src), false,
      `★ ${f} 仍然自己夾取孔數 —— 兩邊一飄就變「見 1 個鑽 64 個」★`)
    assert.equal(/Math\.max\(0\.5,\s*[^)]*BcPcd\s*\/\s*2\)/.test(src), false,
      `★ ${f} 仍然自己計節圓半徑 ★`)
  }
})

test('★ 預覽嘅相對偏移 = commit 嘅絕對圓心（同一組數，淨係差個原點）★', () => {
  const [cx, cy] = [12.5, -7]
  const abs = boltCircleCenters(cx, cy, 100, 33)        // commit 路徑（會夾到 64）
  const rel = boltCircleCenters(0, 0, 100, 33)          // 預覽路徑（原點出偏移）
  assert.equal(abs.length, rel.length)
  for (let i = 0; i < abs.length; i++) {
    assert.ok(Math.abs(abs[i][0] - (cx + rel[i][0])) < 1e-9 &&
              Math.abs(abs[i][1] - (cy + rel[i][1])) < 1e-9,
      `第 ${i} 個孔預覽同結果對唔上`)
  }
})

/* ── sticky：新建要清 ───────────────────────────────────────────────── */

test('★ BUG-515：reset()（檔案▾ 新建）一定要清螺栓孔圈 ★', () => {
  const src = read('src/store.ts')
  const m = src.match(/reset: async \(\) => \{[\s\S]*?\n  \},/)
  assert.ok(m, '搵唔到 reset()')
  assert.match(m[0], /holeBoltCircle: false/,
    '★ 新建之後孔圈仲開住 —— QA 就係咁喺新檔鑽咗 64 個孔 ★')
  assert.match(m[0], /holeBcCount: 4/)
  assert.match(m[0], /holeBcPcd: 50/)
})

test('切線鏈【唔准】被 reset 清 —— 佢係刻意存 localStorage 嘅用戶偏好', () => {
  const src = read('src/store.ts')
  const m = src.match(/reset: async \(\) => \{[\s\S]*?\n  \},/)
  assert.equal(/edgeRoundChain:/.test(m[0]), false,
    '清咗就等於每次新建都幫用戶改返偏好 —— 同 BUG-515 唔同類，唔好順手清')
  assert.match(src, /localStorage\.setItem\('webcad-chain'/, '確認佢真係存落 localStorage')
})

/* ── 對話框摘要要講明 ──────────────────────────────────────────────── */

test('孔圈開住時摘要行要講明會鑽幾個（checkbox 要捲到底先見到）', () => {
  const vp = read('src/components/Viewport.tsx')
  const m = vp.match(/summary=\{\(holeBoltCircle[^\n]*/)
  assert.ok(m, '★ 摘要行冇提孔圈 —— 用戶見唔到個勾就會照撳確定 ★')
  assert.match(m[0], /會鑽/)
  assert.match(m[0], /PCD/)
})
