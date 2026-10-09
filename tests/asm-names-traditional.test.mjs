// BUG(E)：裝配 UI 繁體模式唔可以出簡體（组件1 / 关节类型 / 旋转）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localizeAsmName } from '../src/assembly/names.ts'

test('default component/joint/body names are localized for display', () => {
  assert.equal(localizeAsmName('组件1', 'zh-HK'), '組件1')
  assert.equal(localizeAsmName('关节12', 'zh-HK'), '關節12')
  assert.equal(localizeAsmName('組件3', 'zh-CN'), '组件3')
  assert.equal(localizeAsmName('组件2', 'en'), 'Component 2')
  assert.equal(localizeAsmName('实体1', 'zh-HK'), '實體1')
  assert.equal(localizeAsmName('Bracket', 'zh-HK'), 'Bracket')
  assert.equal(localizeAsmName('组件1 镜像', 'zh-HK'), '組件1 鏡像')
})

test('JointsPanel / BrowserTree render localized names and Traditional joint labels', () => {
  const jp = readFileSync(new URL('../src/components/JointsPanel.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(jp, /JOINT_LABEL\[/)
  assert.match(jp, /tStatus\(JOINT_LABEL_TC\[(j\.type|t)\], lang\)/)   // ASM2 P3：卡片類型改為可更改的下拉（選項同樣經 tStatus）
  assert.match(jp, /localizeAsmName\(c\.name, lang\)/)
  const bt = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  assert.match(bt, /\{localizeAsmName\(c\.name, lang\)\}<\/span>/)
  const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(st, /关节类型（输入编号）/)
})
