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
  assert.match(body, /差約 10%/)
  assert.match(body, /差約 4–5%/)
  assert.match(body, /部分驗證（靜態推力 −12% \/ 前飛偏低 20–35%）/)
  assert.match(body, /照用轉子 CFD（部分驗證：靜態準、前飛偏低）/)
  assert.match(body, /網格預設 coarse/)
  assert.doesNotMatch(body, /網格預設 medium/)
  assert.doesNotMatch(body, /0\.29/)
  assert.doesNotMatch(body, /0\.173/)
  assert.doesNotMatch(body, /0\.171/)
  assert.doesNotMatch(body, /0\.111/)
  assert.doesNotMatch(body, /555×84/)
  assert.doesNotMatch(body, /2–3 倍/)
  assert.doesNotMatch(body, /一至三倍/)
  assert.doesNotMatch(body, /未驗證/)
  assert.doesNotMatch(body, /網格第一次留 coarse/)
  assert.match(body, /Ctrl\+Shift\+A/)
  for (const tool of ['aero_open_lab', 'aero_start_auto_design', 'aero_auto_design_status', 'aero_stop_auto_design']) {
    assert.ok(body.includes(tool), `zh-HK help missing ${tool}`)
  }
  const enBody = HELP_BODY.map((k) => catalogValue(en, k)).join('\n')
  assert.match(enBody, /OpenFOAM/)
  assert.match(enBody, /about 10%/)
  assert.match(enBody, /about 4–5%/)
  assert.match(enBody, /partly validated \(static thrust −12% \/ forward flight 20–35% low\)/)
  assert.match(enBody, /partly validated: static OK, forward flight low/)
  assert.match(enBody, /Mesh defaults to coarse/)
  assert.match(enBody, /gray explanation/)
  assert.doesNotMatch(enBody, /Mesh defaults to medium/)
  assert.doesNotMatch(enBody, /0\.29/)
  assert.doesNotMatch(enBody, /0\.173/)
  assert.doesNotMatch(enBody, /0\.171/)
  assert.doesNotMatch(enBody, /0\.111/)
  assert.doesNotMatch(enBody, /555×84/)
  assert.doesNotMatch(enBody, /2–3×/)
  assert.doesNotMatch(enBody, /one to three times/)
  assert.doesNotMatch(enBody, /not validated/)
  assert.doesNotMatch(enBody, /unvalidated/)
  assert.doesNotMatch(enBody, /mesh coarse/)
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
  assert.match(hk, /差約 \*\*10%\*\*/)
  assert.match(hk, /差約 4–5%/)
  assert.match(hk, /555×73/)
  assert.match(hk, /0\.1096/)
  assert.match(hk, /灰色說明/)
  assert.match(hk, /streamlined-rans/)
  assert.match(hk, /部分驗證（靜態推力 −12% \/ 前飛偏低 20–35%）/)
  assert.match(hk, /照用轉子 CFD（部分驗證：靜態準、前飛偏低）/)
  assert.match(hk, /預設係 \*\*coarse\*\*/)
  assert.doesNotMatch(hk, /0\.29/)
  assert.doesNotMatch(hk, /0\.173/)
  assert.doesNotMatch(hk, /0\.171/)
  assert.doesNotMatch(hk, /0\.111/)
  assert.doesNotMatch(hk, /555×84/)
  assert.doesNotMatch(hk, /2–3 倍/)
  assert.doesNotMatch(hk, /一至三倍/)
  assert.doesNotMatch(hk, /未驗證/)
  assert.doesNotMatch(hk, /偏低大約三成/)
  assert.match(hk, /aero_open_lab/)
  assert.match(hk, /aero_start_auto_design/)
  assert.match(hk, /aero_auto_design_status/)
  assert.match(hk, /aero_stop_auto_design/)
  assert.match(en, /## g\) Auto-design mode/)
  assert.match(en, /## h\) Ask the AI assistant to do it/)
  assert.match(en, /about \*\*10%\*\*/)
  assert.match(en, /about 4–5%/)
  assert.match(en, /555×73/)
  assert.match(en, /0\.1096/)
  assert.match(en, /gray line/)
  assert.match(en, /streamlined-rans/)
  assert.match(en, /partly validated \(static thrust −12% \/ forward flight 20–35% low\)/)
  assert.match(en, /Use rotor CFD anyway \(partly validated: static OK, forward flight low\)/)
  assert.match(en, /defaults to \*\*coarse\*\*/)
  assert.doesNotMatch(en, /0\.29/)
  assert.doesNotMatch(en, /0\.173/)
  assert.doesNotMatch(en, /0\.171/)
  assert.doesNotMatch(en, /0\.111/)
  assert.doesNotMatch(en, /555×84/)
  assert.doesNotMatch(en, /2–3×/)
  assert.doesNotMatch(en, /one to three times/)
  assert.doesNotMatch(en, /about 30% low/)
  assert.doesNotMatch(en, /NOT validated/)
  assert.doesNotMatch(en, /\*\*not validated\*\*/)
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
