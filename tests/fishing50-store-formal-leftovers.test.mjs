/**
 * FISHING50: Formal TC store leftovers (mate / mold / beam / sketch / gear) + fishing49 regressions.
 * Skip MATERIALS/DENSITY_PREF storage keys; skip i18n SC lookup keys.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const st = readFileSync(join(root, 'src/store.ts'), 'utf8')
const i18n = readFileSync(join(root, 'src/i18n.ts'), 'utf8')
const css = readFileSync(join(root, 'src/index.css'), 'utf8')

test('FISHING50 sketch / move-face Formal: 半軸 / 傾斜 / 狀態欄 / 等半徑', () => {
  assert.match(st, /`半軸 rx \$\{L\.toFixed\(1\)\} mm`/)
  assert.match(st, /`半軸 rx \$\{rx\.toFixed\(1\)\} · ry/)
  assert.match(st, /`傾斜 \$\{s\.moveFaceAngle\}°`/)
  assert.match(st, /個可選點 \/ \$\{rg\.segs\.length\} 條可選邊/)
  assert.match(st, /無（未貼住實體面 \/ 無實體）/)
  assert.match(st, /`狀態欄 \$\{s\.status\}`/)
  assert.match(st, /equal: '等半徑'/)
  assert.match(st, /\.replace\('sk', '草圖'\)/)
  assert.doesNotMatch(st, /`半轴 rx \$\{L\.toFixed/)
  assert.doesNotMatch(st, /`倾斜 \$\{s\.moveFaceAngle/)
  assert.doesNotMatch(st, /个可选点/)
  assert.doesNotMatch(st, /`状态栏 \$\{s\.status\}`/)
  assert.doesNotMatch(st, /equal: '等半径'/)
})

test('FISHING50 mate / fit / measure Formal', () => {
  assert.match(st, /flush: '面貼合', distance: '距離'/)
  assert.match(st, /flush: '面貼合', distance: `距離 \$\{s\.mateDistance\}mm`/)
  assert.match(st, /\$\{m\.id\} 錯位\$\{r\.dist/)
  assert.match(st, /\? '過孔' : '寬松配'/)
  assert.match(st, /label: '淨空'/)
  assert.doesNotMatch(st, /flush: '面贴合'/)
  assert.doesNotMatch(st, /\? '过孔' : '宽松配'/)
  assert.doesNotMatch(st, /label: '净空'/)
})

test('FISHING50 conic / gear / group / combine Formal', () => {
  assert.match(st, /\? '橢圓' : rho > 0\.5 \? '雙曲' : '拋物'/)
  assert.match(st, /`組\$\{maxG \+ 1\}`/)
  assert.match(st, /`與「\$\{c\.name\}」運算`/)
  assert.match(st, /`輸入輪 z\$\{plan\.stages\[0\]\.zIn\}`/)
  assert.match(st, /`雙聯輪 z\$\{zPrev\}\+z\$\{zIn\}`/)
  assert.match(st, /`輸出輪 z\$\{zL\}`/)
  assert.match(st, /`姿態\$\{s\.jointPoses\.length \+ 1\}`/)
  assert.match(st, /`視圖\$\{s\.viewBookmarks\.length \+ 1\}`/)
  assert.match(st, /齒輪嚙合 m\$\{m\}/)
  assert.match(st, /分度圓 Ø/)
  assert.match(st, /傳動比/)
  assert.match(st, /齒距/)
  assert.doesNotMatch(st, /\? '椭圆' : rho > 0\.5 \? '双曲' : '抛物'/)
  assert.doesNotMatch(st, /`输入轮 z/)
  assert.doesNotMatch(st, /齿轮啮合 m/)
})

test('FISHING50 rib / pipe / prim / lathe Formal', () => {
  assert.match(st, /\? '·單側' : '·對稱'/)
  assert.match(st, /`·距離\$\{height\}`/)
  assert.match(st, /\? '·到實體' :/)
  assert.match(st, /\? '方' : '圓'\}管/)
  assert.match(st, /（內\$\{glyph\}/)
  assert.match(st, /% 路徑`/)
  assert.match(st, /`圓柱 Ø\$\{\(2 \* cyl\.r\)/)
  assert.match(st, /`球體 Ø\$\{\(2 \* sphere!\.r\)/)
  assert.match(st, / · 淨曲面/)
  assert.match(st, /-車削\.gcode/)
  assert.match(st, /\$\{persistedAxis\} 軸/)
  assert.doesNotMatch(st, /\? '·单侧' : '·对称'/)
  assert.doesNotMatch(st, /\? '方' : '圆'\}管/)
  assert.doesNotMatch(st, /-车削\.gcode/)
})

test('FISHING50 mold / beam Formal report crumbs', () => {
  assert.match(st, /toFixed\(1\)\} 分鐘）/)
  assert.match(st, /澆口：\$\{gates\.length\} 個/)
  assert.match(st, /（自動·頂部中心）/)
  assert.match(st, /趨勢 Dijkstra/)
  assert.match(st, /壓力求解器（Cross 黏度 \+ 移動前沿 FVM）/)
  assert.match(st, /慢冷收縮 — 切「縮痕」場查看分布/)
  assert.match(st, /壁厚均匀，縮痕風險低/)
  assert.match(st, /\|\| '主體'\)/)
  assert.match(st, /\|\| '鋼\(預設\)'\}/)
  assert.match(st, /\? '歐拉細長桿控制' : '短桿壓潰控制'/)
  assert.match(st, /\? '圓截面' : shape === 'tube'/)
  assert.match(st, /\[扭轉\] 扭矩 T=/)
  assert.match(st, /最大剪應力/)
  assert.match(st, /\? '懸臂 wL⁴\/8EI' : '簡支 5wL⁴\/384EI'/)
  assert.match(st, /'盤半徑R'/)
  assert.match(st, /'孔半徑r'/)
  assert.match(st, /'螺栓數'/)
  assert.doesNotMatch(st, /toFixed\(1\)\} 分钟）/)
  assert.doesNotMatch(st, /autoGateNote \? '\（自动·顶部中心\）'/)
  assert.doesNotMatch(st, /: '趋势 Dijkstra'\`/)
  assert.doesNotMatch(st, /\? '欧拉细长杆控制' : '短杆压溃控制'/)
  assert.doesNotMatch(st, /\|\| '钢\(默认\)'\}/)
  assert.doesNotMatch(st, /'盘半径R'/)
})

test('FISHING50 MATERIALS keys stay SC (storage ids)', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('FISHING50 i18n TC aliases', () => {
  assert.match(i18n, /FISHING50 Formal TC store leftovers/)
  assert.match(i18n, /'半軸': 'semi-axis'/)
  assert.match(i18n, /'面貼合': 'Flush mate'/)
  assert.match(i18n, /'歐拉細長桿控制':/)
  assert.match(i18n, /'趨勢 Dijkstra':/)
})

test('FISHING49 Formal + CSS regressions still on tip', () => {
  assert.match(st, / · \| 豎直/)
  assert.match(st, /邊長 L/)
  assert.match(st, /partSolidRequiredPatch\('圓角'/)
  assert.match(st, /partSolidRequiredPatch\('抽殼'/)
  assert.match(st, /revolute: '轉動'/)
  assert.match(st, /closed \? '圓稜' : '弧稜'/)
  assert.match(st, /\? '輪廓' : s\.millOpts\.op === 'pocket' \? '挖槽' : s\.millOpts\.op === 'face' \? '面銑' : '鑽孔'/)
  assert.match(css, /FISHING49: Fusion-like marking-menu/)
  assert.match(i18n, /FISHING49 Formal TC measure/)
})
