// UX3 #3/#4/#5：ribbon 有模型都見到 長方體（split ▾ 圓柱／球／圓環／圓錐／螺旋），圓錐用自己圖示；建立造型 狀態繁體；
// 揀草圖基準面時移動欄讓位；關節面板唔會蓋 ribbon（動態 maxHeight）、加關節後唔跳位、冇 type=number 微調箭咀；
// 用語：關節／自由度／接觸集、「開啟」檔案；組件引用嘅草圖唔標（未使用）。真瀏覽器：scripts/e2e-ux3-assembly.mjs。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src = (f) => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8')
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

test('#3/#5 ribbon: Box is an inline quick split button with Cylinder in its caret; cone has its own icon', () => {
  const r = src('ribbon.ts')
  const box = r.match(/\{ id: 'box', label: '長方體', icon: 'box', sep: true, quick: true,[\s\S]*?quickChildren: \[([\s\S]*?)\]/)
  assert.ok(box, 'box quick split button')
  for (const id of ['box', 'cylinder', 'sphere', 'torus', 'cone', 'coil']) assert.match(box[1], new RegExp(`id: '${id}'`))
  assert.doesNotMatch(r, /id: 'cone', label: '圓錐', icon: 'cylinder'/)
  assert.match(src('icons.tsx'), /\bcone:/)
})

test('#3 FORM environment hints are Traditional (no English FORM Box / FINISH FORM)', async () => {
  const s = src('store.ts')
  for (const bad of ['FINISH FORM', "'FORM Box：", 'FORM Quadball：', 'FORM Pipe：', 'Edit Form：', '當前 Form，再創建']) assert.ok(!s.includes(bad), bad)
  useApp.setState({ lang: 'zh-HK' })
  await g().runCommand('createform')
  assert.match(g().status, /^造型（FORM）環境：在「建立 ▾」選 長方體/)
  assert.doesNotMatch(g().status, /FINISH|Quadball|Box/)
})

test('#4 move bar yields to the sketch plane-pick bar; joints panel docks below the ribbon', () => {
  const v = src('components/Viewport.tsx')
  assert.match(v, /mode !== 'sketch' && mode !== 'pickplane' && \(\s*\/\/ UX3 #4/)
  const j = src('components/JointsPanel.tsx')
  assert.match(j, /dockMaxH/)
  assert.match(j, /querySelector\('\.ribbon/)
  assert.match(j, /bottomGap/)
})

test('#5 joints panel: no spinner number inputs; Traditional 關節 / 自由度 / 接觸集', () => {
  const j = src('components/JointsPanel.tsx')
  assert.doesNotMatch(j, /type="number"/)
  assert.doesNotMatch(j, />JOINTS|DOF \{|Contact Sets/)
  assert.match(j, /tStatus\('關節', lang\)\} \{joints\.length\} · \{tStatus\('自由度', lang\)\}/)
  assert.match(j, /命名接觸集/)
})

test('#5 BOM open ≠ export; open wording 開啟; component-owned sketch not （未使用）', () => {
  const s = src('store.ts')
  assert.match(s, /case 'bom': return get\(\)\.openBOM\(\)/)
  assert.doesNotMatch(s, /['`"]已打開項目/)
  assert.match(s, /statusVerb = '已開啟檔案'|'已開啟檔案'/)
  const t = src('components/BrowserTree.tsx')
  assert.match(t, /const ownerComp = useApp\(/)
  assert.match(t, /refs\(features\) \|\| !!ownerComp/)
})
