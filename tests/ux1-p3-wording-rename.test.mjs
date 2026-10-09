// UX1 #7（P3）：樹改名唔再食最後一個字（輸入法揀字 Enter）；「+ 新增」；浮雕／材料清單繁體；拓撲命名警告講人話。
// 真瀏覽器證明：scripts/e2e-tree-rename-ime.mjs。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { plainBuildWarning, formatBuildWarnings } from '../src/ui/featureStatus.ts'
import { tLabel, msg } from '../src/i18n.ts'
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const worker = rd('src/worker/cad.worker.ts')

test('topology-naming warnings shown in plain words (worker originals untouched)', () => {
  const s1 = worker.match(/buildWarnings\.push\('(持久邊名經上游變換以拓撲順序追蹤解析（真拓撲命名 S1）)'\)/)[1]
  assert.equal(plainBuildWarning(s1), '圓角／倒角的邊已自動重新配對，請檢查')
  assert.equal(plainBuildWarning('持久邊名經上游布爾／圓角以 OCCT 歷史追蹤解析（真拓撲命名 S2）'), '圓角／倒角的邊已自動重新配對，請檢查')
  assert.equal(plainBuildWarning('持久邊名經上游 3 個特徵（布爾／圓角）逐跳 OCCT 歷史追蹤解析（真拓撲命名 S2 多跳）'), '圓角／倒角的邊已自動重新配對，請檢查')
  assert.equal(plainBuildWarning('持久面名經上游變換以拓撲順序追蹤解析（真拓撲命名 S1-面）'), '所選面已自動重新配對，請檢查')
  const drift = '圆角：持久边名喺当前实体上解析唔到、已退回近点拣边，但近点距最近棱 4.2mm（疑上游变换/旋转令选择漂移 — 对称体旋转后边命名会失效）。如结果唔啱请重新拾边。'
  assert.ok(worker.includes("持久边名喺当前实体上解析唔到、已退回近点拣边，但近点距最近棱 ${nd.toFixed(1)}mm"))
  const p = plainBuildWarning(drift)
  assert.match(p, /^圓角的邊已找不到，已改用最近的邊（相差 4\.2 mm/)
  assert.doesNotMatch(p, /持久|漂移|拓撲|近点/)
  assert.match(plainBuildWarning('面拣：持久面名喺当前实体上解析唔到、已退回近点拣面，但近点距最近面 3.0mm（…）'), /^所選面已找不到/)
  assert.equal(plainBuildWarning('掃掠：導軌退回直線'), '掃掠：導軌退回直線')   // unrelated warnings untouched
  assert.equal(formatBuildWarnings(['⚠ ' + s1, s1]), '　⚠ 圓角／倒角的邊已自動重新配對，請檢查')
  assert.ok(rd('src/components/Viewport.tsx').includes("plainBuildWarning(w)"))
})
test('tree rename inputs ignore the IME candidate Enter and commit the live input value', () => {
  const t = rd('src/components/BrowserTree.tsx')
  assert.match(t, /const imeBusy = \(e: .*\) => e\.nativeEvent\.isComposing \|\| e\.keyCode === 229/)
  const inputs = t.split('className="tree-rename"').slice(1).map((x) => x.slice(0, 900))
  assert.equal(inputs.length, 5)
  for (const x of inputs) { assert.match(x, /if \(imeBusy\(e\)\) return/); assert.match(x, /e\.currentTarget\.value/) }
})
test('wording: 「+ 新增」, 浮雕 (zh), 材料清單 table headers in Traditional', () => {
  const pp = rd('src/components/ParamsPanel.tsx')
  assert.ok(pp.includes("tz('+ 新增')")); assert.ok(!pp.includes('+ 添加'))
  assert.equal(tLabel('Emboss', 'zh-HK'), '浮雕'); assert.equal(tLabel('Emboss', 'en'), 'Emboss')
  assert.equal(msg('tool.emboss', 'zh-CN'), '浮雕')
  const st = rd('src/store.ts')
  assert.ok(!/appPrompt\('Emboss|'Emboss 深度'|'Emboss 字高'|已取消 Emboss/.test(st))
  assert.ok(st.includes("const rows = [['序號', '組（子裝配）', '名稱', '數量', '材質', '尺寸 長×闊×高 (mm)', '單件體積 (cm³)'"))
  assert.ok(!st.includes("'单件体积(cm³)'")); assert.ok(!st.includes("'按材料汇总'"))
  assert.ok(st.includes('const summary = `材料清單（'))
})
