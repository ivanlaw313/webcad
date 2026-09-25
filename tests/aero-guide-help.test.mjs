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
  const body = ['help.pAero', 'help.pAeroHow', 'help.pAeroLimit', 'help.pAeroFaq'].map((k) => catalogValue(hk, k)).join('\n')
  for (const term of SEARCH) assert.ok(body.includes(term), `zh-HK help missing ${term}`)
  const enBody = ['help.pAero', 'help.pAeroHow', 'help.pAeroLimit', 'help.pAeroFaq'].map((k) => catalogValue(en, k)).join('\n')
  assert.match(enBody, /OpenFOAM/)
  assert.match(enBody, /30%/)
  assert.match(enBody, /2×/)
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
