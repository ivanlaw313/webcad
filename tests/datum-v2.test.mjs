// Datum rebaking regression executes the production helper and its production
// frame helpers. No handwritten copy can silently drift from the application.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import vm from 'node:vm'
const source=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
const begin=source.indexOf('const _arbNear ='),end=source.indexOf('// After restoring features',begin)
assert.ok(begin>=0&&end>begin,'production datum helper boundaries must exist')
const {_rebakeDatumSketches,_arbEq}=vm.runInNewContext(stripTypeScriptTypes(`(()=>{${source.slice(begin,end)};return {_rebakeDatumSketches,_arbEq}})()`))

let pass = 0, fail = 0
const ok = (n, c, info = '') => { if (c) { pass++; console.log('  ✓', n, info) } else { fail++; console.log('  ✗', n, info) } }
const assoc = (base, offset, extra = {}) => ({ base, offset, src: { kind: 'faceOffset', near: [0, 0, offset], seedDir: [0, 0, 1], offset: 0 }, ...extra })

console.log('#11 datum v2 · _rebakeDatumSketches')

// T1：datum 移动 20→30 → 草图源 baseZ + extrude baseZ 都跟到 30（delta +10）
{
  const s = {
    sketchSources: { sk1: { baseZ: 20, datumRef: { idx: 0, base: 'XY' } } },
    planes: [assoc('XY', 30)],
    features: [{ type: 'extrude', sketchId: 'sk1', baseZ: 20 }],
  }
  const r = _rebakeDatumSketches(s)
  ok('T1 datum 20→30：草图源 baseZ→30', r && r.sources.sk1.baseZ === 30)
  ok('T1 extrude baseZ→30（跟 datum）', r && r.features[0].baseZ === 30)
}

// T2 byte-compat：无 datumRef → 返 null（现行行为，绝不触发第二趟）
{
  const s = { sketchSources: { sk1: { baseZ: 20 } }, planes: [assoc('XY', 30)], features: [{ type: 'extrude', sketchId: 'sk1', baseZ: 20 }] }
  ok('T2 byte-compat：无 datumRef → null', _rebakeDatumSketches(s) === null)
}

// T3：datum 无移动（offset 等 baseZ）→ null
{
  const s = { sketchSources: { sk1: { baseZ: 20, datumRef: { idx: 0, base: 'XY' } } }, planes: [assoc('XY', 20)], features: [] }
  ok('T3 datum 无移动 → null', _rebakeDatumSketches(s) === null)
}

// T4：datum stale（源面搵唔返）→ 跳过，唔郁（同 datum 一致）
{
  const s = { sketchSources: { sk1: { baseZ: 20, datumRef: { idx: 0, base: 'XY' } } }, planes: [assoc('XY', 30, { stale: true })], features: [] }
  ok('T4 datum stale → null（唔郁）', _rebakeDatumSketches(s) === null)
}

// T5：普通原点偏移面也是真正的草图基准；手动编辑偏移必须带动下游。
{
  const s = { sketchSources: { sk1: { baseZ: 20, datumRef: { idx: 0, base: 'XY' } } }, planes: [{ base: 'XY', offset: 30 }], features: [{ type: 'extrude', sketchId: 'sk1', baseZ: 20 }] }
  const r = _rebakeDatumSketches(s)
  ok('T5 非关联原点偏移面：草图基准跟到 30', r && r.sources.sk1.baseZ === 30)
  ok('T5 非关联原点偏移面：下游拉伸跟到 30', r && r.features[0].baseZ === 30)
}

// T6：本地偏移保留 —— extrude baseZ=25（datum 20 + 本地 5），datum→30，delta+10 → extrude baseZ→35（30+5）
{
  const s = {
    sketchSources: { sk1: { baseZ: 20, datumRef: { idx: 0, base: 'XY' } } },
    planes: [assoc('XY', 30)],
    features: [{ type: 'extrude', sketchId: 'sk1', baseZ: 25 }],
  }
  const r = _rebakeDatumSketches(s)
  ok('T6 本地偏移保留：extrude 25→35（datum+10，本地+5 守住）', r && r.features[0].baseZ === 35)
}

// T7：base 唔匹配（datumRef base=XY 但 planes[idx] base=XZ）→ 跳过（防 index 漂移误认）
{
  const s = { sketchSources: { sk1: { baseZ: 20, datumRef: { idx: 0, base: 'XY' } } }, planes: [assoc('XZ', 30)], features: [] }
  ok('T7 base 唔匹配 → null（防 index 漂移误认）', _rebakeDatumSketches(s) === null)
}

// T8：多草图源 —— 一个带 datumRef 跟、一个无 datumRef 不动
{
  const s = {
    sketchSources: { sk1: { baseZ: 20, datumRef: { idx: 0, base: 'XY' } }, sk2: { baseZ: 5 } },
    planes: [assoc('XY', 30)],
    features: [{ type: 'extrude', sketchId: 'sk1', baseZ: 20 }, { type: 'extrude', sketchId: 'sk2', baseZ: 5 }],
  }
  const r = _rebakeDatumSketches(s)
  ok('T8 sk1(datumRef)→30 · sk2(无)不动=5', r && r.sources.sk1.baseZ === 30 && r.sources.sk2.baseZ === 5 && r.features[1].baseZ === 5)
}

// ── GM-3DV2 R12：arb/角度 datum 草图跟 datum 郁 ──
const arb = (o, xd, n) => ({ o, xd, n })
// R12-T1：角度 datum arb 郁（o 5→8）→ 草图源 arb 跟 + extgroup subs.arbPlane 全部换新 arb
{
  const oldArb = arb([0, 0, 5], [1, 0, 0], [0, 0, 1])
  const newArb = arb([0, 0, 8], [1, 0, 0], [0, 0, 1])
  const s = {
    sketchSources: { sk1: { arb: oldArb, datumRef: { idx: 0, base: 'XY', arb: oldArb } } },
    planes: [{ base: 'XY', offset: 0, arb: newArb, aaxis: 'x' }],
    features: [{ type: 'extgroup', sketchId: 'sk1', subs: [{ arbPlane: oldArb }, { arbPlane: oldArb }] }],
  }
  const r = _rebakeDatumSketches(s)
  ok('R12-T1 arb datum 郁：草图源 arb 跟到新 arb', r && _arbEq(r.sources.sk1.arb, newArb))
  ok('R12-T1 extgroup 每 sub.arbPlane 换新 arb', r && r.features[0].subs.every((sub) => _arbEq(sub.arbPlane, newArb)))
}
// R12-T2：arb datum 无郁 → null（datum arb == 草图 arb）
{
  const a = arb([0, 0, 5], [1, 0, 0], [0, 0, 1])
  const s = { sketchSources: { sk1: { arb: a, datumRef: { idx: 0, base: 'XY', arb: a } } }, planes: [{ base: 'XY', offset: 0, arb: a }], features: [] }
  ok('R12-T2 arb 无郁 → null', _rebakeDatumSketches(s) === null)
}
// R12-T3 byte-compat：datumRef 无 arb 字段（旧档 cardinal）→ 仍走 cardinal 分支（唔误入 arb）
{
  const s = { sketchSources: { sk1: { baseZ: 20, datumRef: { idx: 0, base: 'XY' } } }, planes: [assoc('XY', 30)], features: [{ type: 'extrude', sketchId: 'sk1', baseZ: 20 }] }
  const r = _rebakeDatumSketches(s)
  ok('R12-T3 旧 cardinal datumRef（无 arb）仍照旧跟 offset', r && r.sources.sk1.baseZ === 30)
}
// R12-T4：非 extgroup（standalone sketch 特征）arb 草图 → 只烘焙草图源 arb，features 不变
{
  const oldArb = arb([0, 0, 5], [1, 0, 0], [0, 0, 1]), newArb = arb([2, 0, 5], [1, 0, 0], [0, 0, 1])
  const s = { sketchSources: { sk1: { arb: oldArb, datumRef: { idx: 0, base: 'XY', arb: oldArb } } }, planes: [{ base: 'XY', offset: 0, arb: newArb }], features: [{ type: 'sketch', sketchId: 'sk1' }] }
  const r = _rebakeDatumSketches(s)
  ok('R12-T4 arb 草图源烘焙、sketch 特征原样', r && _arbEq(r.sources.sk1.arb, newArb) && r.features[0].type === 'sketch')
}

// Cardinal consumers must all follow the same datum movement; failures here
// expose missing production propagation rather than accepting stale geometry.
for(const type of ['revolve','extgroup','sketch']) {
 const feature=type==='extgroup'?{type,sketchId:'sk1',subs:[{baseZ:20},{baseZ:25}]}:{type,sketchId:'sk1',baseZ:20,plane:'XY'}
 const input={sketchSources:{sk1:{baseZ:20,datumRef:{idx:0,base:'XY'}}},planes:[{base:'XY',offset:30}],features:[feature]}
 const before=JSON.stringify(input),result=_rebakeDatumSketches(input)
 ok(`cardinal ${type}: source moves to 30`,result&&result.sources.sk1.baseZ===30)
 ok(`cardinal ${type}: consuming geometry follows datum and preserves local offset`,result&&(type==='extgroup'?result.features[0].subs[0].baseZ===30&&result.features[0].subs[1].baseZ===35:result.features[0].baseZ===30))
 ok(`cardinal ${type}: input remains unchanged`,JSON.stringify(input)===before)
}

console.log(`\n#11 datum v2 + GM-3DV2 R12: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
