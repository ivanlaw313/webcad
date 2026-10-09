// RETEST19 #2：參數名稱／數值／表達式欄用本地草稿，Enter／失焦先提交（唔再逐鍵改名失焦 'wid'→'d'）。
// RETEST19 #3：參數面板 zh-HK 顯示繁體（名稱·數值·表達式、進階：配置、設計表及導出、參數 d1 名稱/數值），zh-CN 保持簡體。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { paramsPanelText } from '../src/components/paramsPanelText.ts'
import { SC2TC_CHARS } from '../src/i18n/sc2tcHK.ts'
const src = readFileSync(new URL('../src/components/ParamsPanel.tsx', import.meta.url), 'utf8')
const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
const literals = [...code.matchAll(/tz\((['`])((?:(?!\1).)*)\1/g)].map((m) => m[2])
const SC = new Set(Object.keys(SC2TC_CHARS).filter((k) => SC2TC_CHARS[k] !== k))
const TC = new Set(Object.values(SC2TC_CHARS).filter((v) => !SC.has(v)))

test('#2 name field: local draft, committed once on Enter/blur; rows keyed by stable id; busy → readOnly (no focus loss)', () => {
  const fn = src.slice(src.indexOf('function ParameterName'), src.indexOf('// A rejected edit'))
  assert.match(fn, /const \[draft, setDraft\] = useState\(name\)/)
  assert.match(fn, /onChange=\{\(e\) => setDraft\(e\.target\.value\)\}/)
  assert.match(fn, /onBlur=\{commit\}/)
  assert.match(fn, /e\.key === 'Enter'[^\n]*blur\(\)/)
  assert.match(fn, /readOnly=\{busy\}/)
  assert.doesNotMatch(fn, /onChange=[^\n]*onCommit/)
  assert.doesNotMatch(src, /onChange=[^\n]*renameParam/)
  assert.match(src, /<div key=\{p\.id \?\? p\.name\} className="pp-row">/)
  assert.doesNotMatch(src, /className="pp-name"[^\n]*disabled=\{busy\}/)
  // 外部值變化（重建）唔覆蓋打緊嘅草稿
  for (const name of ['function ParameterValue', 'function ParameterName', 'function ParameterExpression']) {
    const body = src.slice(src.indexOf(name), src.indexOf(name) + 1600)
    assert.match(body, /if ?\(!editing\.current\) ?setDraft/, name)
    assert.match(body, /onFocus=\{\(\) ?=> ?\{ ?editing\.current ?= ?true ?\}\}/, name)
  }
  // 「+添加」自動名 → 聚焦新行用 data 屬性（aria-label 已本地化）
  assert.match(src, /input\.pp-name\[data-param-name=/)
})

test('#2 store: one rename keeps the parameter id (what the draft commits)', async () => {
  const { useApp } = await import('../src/store.ts')
  const g = () => useApp.getState()
  useApp.setState({ params: [], busy: false })
  g().addParam('', 50)
  const id = g().params[0].id
  assert.equal(g().params[0].name, 'd1')
  g().renameParam('d1', 'wid')
  assert.deepEqual(g().params.map((p) => [p.name, p.id]), [['wid', id]])
})

test('#3 every panel string is Traditional in source and on zh-HK; zh-CN gets Simplified', () => {
  assert.ok(literals.length >= 30, String(literals.length))
  const hk = paramsPanelText('zh-HK'), cn = paramsPanelText('zh-CN')
  for (const s of literals) {
    const scLeft = [...s].filter((c) => SC.has(c))
    assert.deepEqual(scLeft, [], `source literal has Simplified: ${s}`)
    assert.deepEqual([...hk(s)].filter((c) => SC.has(c)), [], `zh-HK: ${hk(s)}`)
    assert.deepEqual([...cn(s)].filter((c) => TC.has(c)), [], `zh-CN still Traditional: ${cn(s)}`)
  }
  // 測試員點名嘅字串
  assert.equal(hk('名稱 · 數值 · 表達式（長度單位 mm）'), '名稱 · 數值 · 表達式（長度單位 mm）')
  assert.equal(cn('名稱 · 數值 · 表達式（長度單位 mm）'), '名称 · 数值 · 表达式（长度单位 mm）')
  assert.equal(cn('進階：配置、設計表及導出'), '进阶：配置、设计表及导出')
  assert.equal(hk('參數 d1 名稱'), '參數 d1 名稱')
  assert.equal(cn('參數 d1 數值'), '参数 d1 数值')
  for (const s of ['名稱 · 數值 · 表達式', '參數 ${name} 名稱', '參數 ${name} 數值', '參數 ${name} 表達式']) assert.ok(src.includes(s), s)
  assert.ok(/(?:進階：配置、設計表及)(?:導出|匯出)/.test(src), '進階：配置、設計表及(?:導出|匯出)')
  // 非註解代碼唔再有簡體 UI 字（只剩註解）
  const scInCode = [...code.matchAll(/[\u4e00-\u9fff]+/g)].map((m) => m[0]).filter((w) => [...w].some((c) => SC.has(c)))
  assert.deepEqual(scInCode, [])
})
