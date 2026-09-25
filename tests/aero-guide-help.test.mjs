// Static check: in-app aero/hydro help section, four-locale keys, command-palette search terms.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => readFileSync(join(root, rel), 'utf8')

const LOCALES = ['zh-HK', 'zh-CN', 'en', 'ja']
const KEYS = [
  'help.hAero',
  'help.pAero',
  'help.pAeroHow',
  'help.pAeroAuto',
  'help.pAeroAi',
  'help.pAeroLimit',
  'help.pAeroFaq',
  'cmd.aeroguide',
  'alias.aeroguide',
  'tip.aeroguide',
]
const SEARCH = ['氣動', 'CFD', '風洞教學', 'aero guide']

function catalogValue(src, key) {
  const m = src.match(new RegExp(`"${key}": "([^"]*)"`))
  assert.ok(m, `missing ${key}`)
  assert.ok(m[1].trim().length > 0, `empty ${key}`)
  return m[1]
}

test('HelpPanel has an aero/hydro section', () => {
  const help = read('src/components/HelpPanel.tsx')
  assert.match(help, /h: 'help\.hAero'/)
  assert.match(help, /p: 'help\.pAero'/)
  assert.match(help, /extra: 'help\.pAeroHow'/)
  assert.match(help, /'help\.pAeroAuto'/)
  assert.match(help, /'help\.pAeroAi'/)
  assert.match(help, /'help\.pAeroLimit'/)
  assert.match(help, /'help\.pAeroFaq'/)
  assert.match(help, /showMe: 'aerolab'/)
  assert.match(help, /b\.more\?\.map/)
})

test('four locales carry the aero guide keys', () => {
  for (const lang of LOCALES) {
    const src = read(`src/i18n/locales/${lang}.ts`)
    for (const key of KEYS) catalogValue(src, key)
  }
  const hk = read('src/i18n/locales/zh-HK.ts')
  assert.match(catalogValue(hk, 'help.hAero'), /氣動／水動設計/)
  const en = read('src/i18n/locales/en.ts')
  assert.match(catalogValue(en, 'help.hAero'), /Aero \/ hydro design/)
  const HELP_BODY = ['help.pAero', 'help.pAeroHow', 'help.pAeroAuto', 'help.pAeroAi', 'help.pAeroLimit', 'help.pAeroFaq']
  const body = HELP_BODY.map((k) => catalogValue(hk, k)).join('\n')
  for (const term of SEARCH) assert.ok(body.includes(term), `zh-HK help missing ${term}`)
  assert.match(body, /自動設計模式/)
  assert.match(body, /最佳已驗證設計/)
  assert.match(body, /只用工程估算/)
  assert.match(body, /一至三倍/)
  assert.match(body, /Ctrl\+Shift\+A/)
  for (const tool of ['aero_open_lab', 'aero_start_auto_design', 'aero_auto_design_status', 'aero_stop_auto_design']) {
    assert.ok(body.includes(tool), `zh-HK help missing ${tool}`)
  }
  const enBody = HELP_BODY.map((k) => catalogValue(en, k)).join('\n')
  assert.match(enBody, /OpenFOAM/)
  assert.match(enBody, /one to three times/)
  assert.match(enBody, /2×/)
  assert.match(enBody, /Best verified design/)
  assert.match(enBody, /Estimator only/)
  assert.match(enBody, /Ctrl\+Shift\+A/)
  assert.match(enBody, /aero_start_auto_design/)
  const hkAuto = catalogValue(hk, 'help.pAeroAuto').length + catalogValue(hk, 'help.pAeroAi').length
  for (const lang of ['zh-CN', 'ja']) {
    const src = read(`src/i18n/locales/${lang}.ts`)
    const auto = catalogValue(src, 'help.pAeroAuto')
    const ai = catalogValue(src, 'help.pAeroAi')
    assert.ok(auto.length + ai.length < hkAuto, `${lang} auto/AI help should stay shorter than zh-HK`)
    const short = `${auto}\n${ai}`
    assert.match(short, /aero_open_lab/)
    assert.match(short, /aero_stop_auto_design/)
    assert.match(short, /Ctrl\+Shift\+A/)
  }
})

test('aero guides cover auto-design, the AI assistant, and the estimate gap', () => {
  const hk = read('docs/AERO_GUIDE_zh-HK.md')
  const en = read('docs/AERO_GUIDE_en.md')
  assert.match(hk, /## g\) 自動設計模式（AI 自己設計、自己測試、搵最佳）/)
  assert.match(hk, /## h\) 叫 AI 助手幫你做/)
  assert.match(hk, /一至三倍/)
  assert.doesNotMatch(hk, /偏低大約三成/)
  assert.match(hk, /aero_open_lab/)
  assert.match(hk, /aero_start_auto_design/)
  assert.match(hk, /aero_auto_design_status/)
  assert.match(hk, /aero_stop_auto_design/)
  assert.match(en, /## g\) Auto-design mode/)
  assert.match(en, /## h\) Ask the AI assistant to do it/)
  assert.match(en, /one to three times/)
  assert.doesNotMatch(en, /about 30% low/)
  assert.match(en, /aero_start_auto_design/)
  assert.match(en, /Best verified design/)
})

test('command palette can find the aero guide', () => {
  const palette = read('src/components/CommandPalette.tsx')
  const avail = read('src/cad/commandAvailability.ts')
  assert.match(palette, /id: 'aeroguide'/)
  assert.match(palette, /labelKey: 'cmd\.aeroguide'/)
  assert.match(palette, /if \(!s\.helpOpen\) s\.toggleHelp\(\)/)
  assert.match(avail, /VIEW_COMMANDS = new Set\(\[[^\]]*aeroguide/)
  for (const lang of LOCALES) {
    const alias = catalogValue(read(`src/i18n/locales/${lang}.ts`), 'alias.aeroguide').toLowerCase()
    for (const term of SEARCH) assert.ok(alias.includes(term.toLowerCase()), `${lang} alias missing ${term}`)
  }
})
