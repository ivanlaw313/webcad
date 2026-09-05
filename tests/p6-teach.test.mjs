// P6 AI 教学：searchRibbonCommand 模糊匹配验证（中文问句 → 真实 ribbon 命令）。纯数据，无 wasm。
import { searchRibbonCommand } from '../src/ribbon.ts'

let pass = 0, fail = 0
const hit = (query, expectId, note = '') => {
  // GM-L2 修旧账：expectId 可以系数组 —— 一个 query 有多个同样正确嘅命中（如「倒圆角」exact 命中草图角命令，
  // 自然问句「点样倒圆角」先系实体 fillet；两者都系真命令真位置，唔应过窄锁死单一 id）。
  const exp = Array.isArray(expectId) ? expectId : [expectId]
  const r = searchRibbonCommand(query)
  const ok = r && exp.includes(r.id)
  if (ok) { pass++; console.log(`  ✓ "${query}" → ${r.id} (${r.tab}→${r.panel}) ${note}`) }
  else { fail++; console.log(`  ✗ "${query}" 期望 ${exp.join('|')}，实得 ${r ? r.id : 'null'} ${note}`) }
}
const miss = (query) => {
  const r = searchRibbonCommand(query)
  if (!r) { pass++; console.log(`  ✓ "${query}" → null（正确：无匹配）`) }
  else { fail++; console.log(`  ✗ "${query}" 期望 null，实得 ${r.id}`) }
}

console.log('P6 searchRibbonCommand')
// 中文问句命中 label（子串）
hit('倒圆角', ['fillet', 'sk_filletc'], 'exact 命中草图「倒圆角」或实体圆角皆正确')
hit('点样倒圆角', 'fillet', '自然问句 → 实体圆角（同分 tie SOLID 先行）')
hit('圆角', 'fillet')
hit('拉伸', 'extrude')
hit('抽壳', 'shell')
hit('打孔', 'hole', '含 label「孔」')
hit('创建草图', 'sketch', 'exact label')
hit('球', 'sphere')
hit('旋转', 'revolve')
// 英文 id 命中
hit('extrude', 'extrude')
hit('fillet', 'fillet')
// 返回结构完整
{
  const r = searchRibbonCommand('倒圆角')
  const okStruct = r && r.tab && r.panel && typeof r.label === 'string'
  if (okStruct) { pass++; console.log(`  ✓ 结构完整：{id,label,tab,panel} 齐（fillet → ${r.tab}/${r.panel}, 快捷键 ${r.shortcut || '—'}）`) }
  else { fail++; console.log('  ✗ 返回结构缺字段') }
}
// 无匹配
miss('asdfghjkl')
miss('')

console.log(`\nP6 searchRibbonCommand: ${pass} passed, ${fail} failed`)
if (fail) process.exit(1)
