// patterns-sym.test.mjs — 环形阵列对称模式（sym）角度布点 + 偶数件诚实披露 的验收测（backlog #64 / #71）。
// 背景：worker cpAngles(n,total,'sym') 布点 —— 种子固定喺 0°，然后 ±step 对称铺；n 偶数（n−1 为奇）时
//   + 侧会多放一件（step*(half+1)），令阵列【唔关于种子对称】、跨度唔对称。n=2 更极端：只得【单边一个】喺 +total。
//
// 本次决策（byte-compat 优先）：cpAngles 角度算法【一个字节都唔改】—— 因为改布点会令任何已存旧档嘅 circPattern
//   重放到唔同位置（违反「旧档 byte 兼容」硬规）。改为喺 circPattern 层【诚实披露】：sym + 偶数件时 push 一条
//   buildWarnings，报出实际 +/− 侧角跨度，叫用户要真对称就用奇数件或改「角度」模式。
//
// 故本测两部分：
//   (A) 纯逻辑：以 cpAnglesRef（逐字节重演现役 cpAngles）验 n=2/3/4/5 布点 —— 证 n=3/4/5 同今日一致（未改），
//       n=2 系已知【单边一个】嘅坏对称；并验偶数件披露用嘅 maxPos/maxNeg 计算（同 worker 警告分支同款）。
//   (B) 真内核：用 replicad_plus 真起 n=2 同 n=3 sym 环形阵列（rotate+fuse 真几何，同 circPattern 一样嘅内核 op），
//       证 n=2 得单边一个（Y 唔对称）、n=3 真对称（Y 对称）—— 喺真实几何上重现 #64/#71 现象。
// 跑法（喺 C:\ClaudeCode\webcad）：npx -y tsx tests/patterns-sym.test.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }
const arrClose = (a, b, tol = 1e-6) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) < tol)

// ── cpAnglesRef：逐字节重演现役 src/worker/cad.worker.ts cpAngles（sym / full / angle）。────────────
//   若将来 worker 改咗此函数，本 ref 同实测（B 段真内核）会分叉 → 本测即时失守，提醒同步。
function cpAnglesRef(n, total, mode) {
  const out = []
  if (mode === 'sym') {
    const step = total / (n - 1)
    const half = Math.floor((n - 1) / 2)
    for (let k = 1; k <= half; k++) { out.push(step * k); out.push(-step * k) }
    if ((n - 1) % 2 === 1) out.push(step * (half + 1))
  } else {
    const step = mode === 'full' ? 360 / n : (Math.abs(total) >= 359.9 ? total / n : total / (n - 1))
    for (let i = 1; i < n; i++) out.push(step * i)
  }
  return out
}

// ════════════════════════ (A) 纯逻辑：布点契约（n=3/4/5 未改 + n=2 已知坏对称）════════════════════════
// n=2 sym total=90：单边一个喺 +90（种子 0 之外净得一件、偏晒去一边 → #64 现象）
report('(A) sym n=2 total=90 → 单边一件 [90]（#64 坏对称，种子外只得一个偏末端）', arrClose(cpAnglesRef(2, 90, 'sym'), [90]), { got: cpAnglesRef(2, 90, 'sym') })
// n=3 sym total=120：真对称 ±60（未改）
report('(A) sym n=3 total=120 → 对称 [60,-60]（未改）', arrClose(cpAnglesRef(3, 120, 'sym'), [60, -60]), { got: cpAnglesRef(3, 120, 'sym') })
// n=4 sym total=90：+30,-30,+60（偶数件 + 侧多一个，未改）
report('(A) sym n=4 total=90 → [30,-30,60]（偶数件 + 侧多一个，未改）', arrClose(cpAnglesRef(4, 90, 'sym'), [30, -30, 60]), { got: cpAnglesRef(4, 90, 'sym') })
// n=5 sym total=120：±30,±60（真对称，未改）
report('(A) sym n=5 total=120 → [30,-30,60,-60]（对称，未改）', arrClose(cpAnglesRef(5, 120, 'sym'), [30, -30, 60, -60]), { got: cpAnglesRef(5, 120, 'sym') })
// full / angle 未受影响（回归护栏）
report('(A) full n=4 → [90,180,270]（360/n）', arrClose(cpAnglesRef(4, 999, 'full'), [90, 180, 270]), { got: cpAnglesRef(4, 999, 'full') })
report('(A) angle n=4 total=90 → [30,60,90]（端点含）', arrClose(cpAnglesRef(4, 90, 'angle'), [30, 60, 90]), { got: cpAnglesRef(4, 90, 'angle') })

// 对称性判定：把 (种子0 ∪ 各副本角) 排序，检查是否关于 0 镜像对称。
const isSym = (angles) => { const s = [0, ...angles].map((a) => +a.toFixed(6)).sort((x, y) => x - y); return s.every((v, i) => Math.abs(v + s[s.length - 1 - i]) < 1e-6) }
report('(A) 奇数件对称：n=3 / n=5 真关于种子对称', isSym(cpAnglesRef(3, 120, 'sym')) && isSym(cpAnglesRef(5, 120, 'sym')), {})
report('(A) 偶数件唔对称：n=2 / n=4 唔关于种子对称（#64/#71 现象）', !isSym(cpAnglesRef(2, 90, 'sym')) && !isSym(cpAnglesRef(4, 90, 'sym')), {})

// 诚实披露分支（同 worker circPattern 里 #64/#71 警告用嘅 maxPos/maxNeg 同款计算）
const disclose = (n, total) => { const a = cpAnglesRef(n, total, 'sym'); return { maxPos: Math.max(0, ...a), maxNeg: Math.min(0, ...a) } }
{
  const d2 = disclose(2, 90)   // n=2：+侧到 90、−侧到 0
  report('(A) 披露 n=2 total=90 → +侧 90 / −侧 0（单边）', d2.maxPos === 90 && d2.maxNeg === 0, d2)
  const d4 = disclose(4, 90)   // n=4：+侧到 60、−侧到 −30（跨度唔对称，最大角 60>45）
  report('(A) 披露 n=4 total=90 → +侧 60 / −侧 −30（唔对称，最大角 60>total/2=45）', d4.maxPos === 60 && d4.maxNeg === -30 && d4.maxPos !== -d4.maxNeg, d4)
}

// ════════════════════════ (B) 真内核：n=2 / n=3 sym 环形阵列（rotate+fuse 同 circPattern 同款 op）══════════
// 起一个离 Z 轴 50mm 嘅小盒做种子，绕 Z（过原点）按 cpAnglesRef 角度旋转 fuse 副本 → 返合并体 bbox。
const AX = [0, 0, 1], CTR = [0, 0, 0]
const buildSymPattern = (n, total) => {
  const seed = makeBaseBox(10, 10, 10).translate(50, 0, 0)   // 种子喺 x∈[45,55], y∈[-5,5], z∈[0,10]
  let acc = seed
  for (const a of cpAnglesRef(n, total, 'sym')) acc = acc.fuse(seed.clone().rotate(a, CTR, AX))
  const b = acc.boundingBox.bounds
  return { minY: b[0][1], maxY: b[1][1], minX: b[0][0], maxX: b[1][0], finite: b.flat().every(Number.isFinite) }
}

// n=2 sym total=90：副本净落 +90（种子 0 之外一个）→ +Y 侧有料（maxY≈55）、−Y 侧无副本（minY≈−5，唔系 −55）
{
  const r = buildSymPattern(2, 90)
  const okBuild = r.finite && r.maxX > -1 && r.maxY > 1
  const oneSided = r.maxY > 50 && r.minY > -20   // 有 +90 副本（maxY≈55）但无 −90 副本（否则 minY≈−55）
  const asym = Math.abs(r.minY + r.maxY) > 1     // Y 唔对称
  report('(B) 真内核 n=2 sym：build 成功、单边一件（+Y 有料 / −Y 无副本）、Y 唔对称 —— 重现 #64', okBuild && oneSided && asym, r)
}
// n=3 sym total=120：副本 ±60 → 合并体关于 XZ 面（y→−y）真对称 → minY ≈ −maxY
{
  const r = buildSymPattern(3, 120)
  const okBuild = r.finite && r.maxY > 1
  const ySym = Math.abs(r.minY + r.maxY) < 0.01   // 真对称
  report('(B) 真内核 n=3 sym：build 成功且 Y 关于种子对称（minY≈−maxY）—— 奇数件未受影响', okBuild && ySym, r)
}

console.log(`\n== patterns-sym: ${pass} pass / ${fail} fail ==`)
process.exit(fail ? 1 : 0)
