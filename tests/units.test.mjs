// T794：单位解析 node 测试（照 gears.test.mjs 风格）
import { parseLen, toLenInput } from '../src/io/units.ts'

let pass = 0, fail = 0
const rows = []
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t
const ck = (name, cond, detail) => { rows.push([cond ? 'PASS' : 'FAIL', name, detail || '']); cond ? pass++ : fail++ }

// 当前单位换算
ck('mm 直读', near(parseLen('12.7', 'mm'), 12.7), parseLen('12.7', 'mm'))
ck('cm 换算', near(parseLen('1.2', 'cm'), 12), parseLen('1.2', 'cm'))
ck('inch 换算', near(parseLen('1', 'inch'), 25.4), parseLen('1', 'inch'))
// 分数英寸
ck('分数 1/2 inch', near(parseLen('1/2', 'inch'), 12.7), parseLen('1/2', 'inch'))
ck('分数 1 1/2 inch', near(parseLen('1 1/2', 'inch'), 38.1), parseLen('1 1/2', 'inch'))
ck('分数 1-1/2 inch', near(parseLen('1-1/2', 'inch'), 38.1), parseLen('1-1/2', 'inch'))
ck('分数 3/8 inch', near(parseLen('3/8', 'inch'), 9.525), parseLen('3/8', 'inch'))
// 显式后缀覆盖当前单位
ck('后缀 mm 覆盖 inch模式', near(parseLen('12.7mm', 'inch'), 12.7), parseLen('12.7mm', 'inch'))
ck('后缀 in 覆盖 mm模式', near(parseLen('1in', 'mm'), 25.4), parseLen('1in', 'mm'))
ck('后缀 " 覆盖', near(parseLen('0.5"', 'mm'), 12.7), parseLen('0.5"', 'mm'))
ck('后缀 cm', near(parseLen('2cm', 'mm'), 20), parseLen('2cm', 'mm'))
// 拒绝杂质
ck('拒绝空串', parseLen('', 'mm') === null)
ck('拒绝字母', parseLen('12abc', 'mm') === null, String(parseLen('12abc', 'mm')))
ck('拒绝除零', parseLen('1/0', 'inch') === null, String(parseLen('1/0', 'inch')))
// 往返
ck('toLenInput inch', toLenInput(25.4, 'inch') === '1', toLenInput(25.4, 'inch'))
ck('toLenInput mm 剪零', toLenInput(12, 'mm') === '12', toLenInput(12, 'mm'))
ck('往返 inch 3/8', near(parseLen(toLenInput(9.525, 'inch'), 'inch'), 9.525, 1e-3), toLenInput(9.525, 'inch'))

console.log('\n========== PASS/FAIL 总表 ==========')
for (const [st, n, d] of rows) console.log(`  ${st}  ${n}${d !== '' ? '  (' + d + ')' : ''}`)
console.log('====================================')
console.log(fail === 0 ? `全部 ${pass} 项通过` : `${fail} 项失败`)
process.exit(fail === 0 ? 0 : 1)
