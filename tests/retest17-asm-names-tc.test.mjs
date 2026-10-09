// RETEST17 #3：zh-HK 唔可以出「组件1 → 实体1」/「移動/旋轉 实体1」— 預設名繁體生成 + 顯示層 localizeAsmName。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localizeAsmName } from '../src/assembly/names.ts'

const rd = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('localizeAsmName handles copy suffix and both scripts', () => {
  assert.equal(localizeAsmName('实体3 (1)', 'zh-HK'), '實體3 (1)')
  assert.equal(localizeAsmName('實體3 (1)', 'zh-CN'), '实体3 (1)')
  assert.equal(localizeAsmName('組件2', 'en'), 'Component 2')
  assert.equal(localizeAsmName('實體1', 'zh-HK'), '實體1')
})

test('default-name generators emit Traditional (組件/實體/關節), no Simplified leftovers', () => {
  const st = rd('../src/store.ts')
  assert.doesNotMatch(st, /'组件' \+ n/)
  assert.doesNotMatch(st, /name: '关节' \+ n/)
  assert.doesNotMatch(st, /name: '关节' \+ nid/)
  assert.doesNotMatch(st, /type: 'newbody', name: `实体\$\{n\}`/)
  assert.doesNotMatch(st, /' 镜像'/)
  assert.match(st, /const nm = lb\.active \? '組件' \+ n : \(lb\.name \? `\$\{lb\.name\}` : '組件' \+ n\)/)
  assert.match(st, /name: '關節' \+ n, type,/)
  const wk = rd('../src/worker/cad.worker.ts')
  assert.doesNotMatch(wk, /name: `实体\$\{/)
  assert.doesNotMatch(wk, /f\.name \|\| `实体/)
  assert.match(wk, /parkedBodies\.push\(\{ name: `實體\$\{parkedBodies\.length \+ 1\}`/)
})

test('joint title row, move/rotate row and body rows localize names', () => {
  const jp = rd('../src/components/JointsPanel.tsx')
  assert.match(jp, /const name = \(id: string\) => localizeAsmName\(components\.find\(\(c\) => c\.id === id\)\?\.name \?\? id, lang\)/)
  assert.match(jp, /\{name\(j\.parent\)\} → \{name\(j\.child\)\}/)
  const vp = rd('../src/components/Viewport.tsx')
  assert.match(vp, /\{tStatus\('移動\/旋轉', lang\)\} \{localizeAsmName\(selComp\.name, lang\)\}/)
  const bt = rd('../src/components/BrowserTree.tsx')
  assert.match(bt, /\{localizeAsmName\(body\.name, lang\)\}/)
})
