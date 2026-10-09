// zh-HK formal-wording guard (owner rule): every user-visible zh string in src/ must be FORMAL written
// Traditional Chinese (Hong Kong) — no colloquial Cantonese (唔/冇/係/嘅/喺/佢/咗/揀/撳…), no 'Fusion'
// mentions, no 創建 (HK: 建立). Scans every string literal / template part / JSX text in src/**/*.ts(x)
// with the TypeScript parser. Simplified literals are checked too (zh-HK renders them via sc2tcHK).
// Excluded: script-conversion tables, zh-CN / en / ja locale files, and unit tests.
// Values of explicit zh-CN properties and GLSL shader sources (comments only) are skipped.
import test from 'node:test'
import assert from 'node:assert/strict'
import ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const EXCLUDE = [
  /^src\/i18n\/(tc2sc|sc2tcHK|t2sChars|zhCNLabels|jaLabels)\.ts$/,
  /^src\/i18n\/locales\/(zh-CN|en|ja)\.ts$/,
  /__tests__\//,
]
// Formal words that happen to contain a marker character.
const PROTECT = ['關係', '关系', '係數', '系数', '聯係', '喇叭', '晒圖', '啫喱', '濃郁', '郁金香', '咪表']
const COLLOQUIAL = /[係嘅唔冇咩呢喺喘佢嚟啲哋咗嗰乜嘢噉咁啱睇俾畀攞囉吖㗎嘞喎吓晒撳揿㩒撚搵揾諗谂嘥冚嚿揀拣噲唎噃郁]|而家|幾多|几多|邊個|边个|點樣|点样|先至|先會|即係|就係|(?<![關关聯联體体標标座參参世界坐軸轴派直母語语水譜谱星銀银位])系(?![統统列數数譜谱])/
const BANNED = /Fusion|創建|创建/
// Genuinely needed cases: `${file}:${exact literal text}` (keep tiny; justify each).
const ALLOW = new Set([])

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx)$/.test(n) && !/\.d\.ts$/.test(n)) out.push(p)
  }
  return out
}

function scan() {
  const hits = []
  let checked = 0
  for (const f of walk(join(ROOT, 'src'))) {
    const rel = relative(ROOT, f).split('\\').join('/')
    if (EXCLUDE.some((r) => r.test(rel))) continue
    const src = readFileSync(f, 'utf8')
    if (!/[\u3400-\u9fff]|Fusion/.test(src)) continue
    const sf = ts.createSourceFile(f, src, ts.ScriptTarget.Latest, true, f.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const K = ts.SyntaxKind
    const visit = (n) => {
      const k = n.kind
      if (k === K.StringLiteral || k === K.NoSubstitutionTemplateLiteral || k === K.TemplateHead || k === K.TemplateMiddle || k === K.TemplateTail || k === K.JsxText) {
        const text = src.slice(n.getStart(sf), n.getEnd())
        const pa = n.parent
        const isZhCN = pa && ts.isPropertyAssignment(pa) && /^['"]?(zh-CN|zhCN|zh_CN)['"]?$/.test(pa.name.getText(sf))
        const isImport = pa && (ts.isImportDeclaration(pa) || ts.isExportDeclaration(pa))
        const isGLSL = /\buniform\s|void main|gl_Frag|#version|precision highp/.test(text)
        if (!isZhCN && !isImport && !isGLSL && /[\u3400-\u9fff]/.test(text)) {
          checked++
          const t = PROTECT.reduce((a, w) => a.split(w).join(''), text)
          const m = t.match(COLLOQUIAL) ?? text.match(BANNED)
          if (m && !ALLOW.has(`${rel}:${text}`)) hits.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} [${m[0]}] ${text.slice(0, 120)}`)
        } else if (!isZhCN && !isImport && /\bFusion\b/.test(text) && pa && ts.isJsxAttribute(pa)) {
          // English JSX attribute text (e.g. title="Fusion …") is shown in every language
          hits.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} [Fusion] ${text.slice(0, 120)}`)
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  return { hits, checked }
}

test('zh-HK UI strings are formal written Traditional Chinese (no colloquial Cantonese / Fusion / 創建)', () => {
  const { hits, checked } = scan()
  assert.ok(checked > 3000, `scanner sanity: only ${checked} zh literals found`)
  assert.equal(hits.length, 0, `${hits.length} colloquial / banned zh-HK strings:\n` + hits.slice(0, 80).join('\n'))
})
