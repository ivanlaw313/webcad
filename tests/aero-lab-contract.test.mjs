// Aero Design Lab — entry-point / i18n contract (source level, cheap).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CATALOGS, LOCALES } from '../src/i18n.ts'
import { at, metricLabel, varLabel, AERO_STRING_KEYS } from '../src/aero/aeroI18n.ts'
import { KIND_SCHEMA } from '../src/aero/designSpace.ts'

const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

test('ribbon: Aero Lab sits in the LAB Simulation group next to the wind tunnel', () => {
  const grp = ribbon.match(/name: '仿真',\s*tools: \[([\s\S]*?)\n {4}\]/)?.[1] ?? ''
  assert.match(grp, /id: 'windtunnel'/)
  assert.match(grp, /id: 'aerolab', label: '氣動設計實驗室'/)
  assert.match(store, /case 'aerolab': openAeroLab\(\)/)
  assert.match(app, /lazy\(\(\) => import\('\.\/components\/AeroLab'\)\)/)
  assert.match(app, /aeroLabOpen && <ErrorBoundary/)
})

test('i18n: cmd/tool/alias/tip keys in all four locales; panel strings complete', () => {
  for (const L of LOCALES) for (const k of ['cmd.aerolab', 'tool.aerolab', 'alias.aerolab', 'tip.aerolab']) assert.ok(CATALOGS[L][k], `${L} ${k}`)
  assert.equal(CATALOGS['zh-HK']['cmd.aerolab'], '氣動設計實驗室')
  assert.equal(CATALOGS.en['cmd.aerolab'], 'Aero Design Lab')
  for (const L of LOCALES) for (const k of AERO_STRING_KEYS) assert.ok(at(L, k).trim().length > 0, `${L} ${k}`)
  for (const kind of Object.keys(KIND_SCHEMA)) {
    for (const k of KIND_SCHEMA[kind].vars) assert.notEqual(varLabel('ja', k), k, `var label ${k}`)
    for (const k of KIND_SCHEMA[kind].metrics) assert.notEqual(metricLabel('zh-HK', k), k, `metric label ${k}`)
  }
})
