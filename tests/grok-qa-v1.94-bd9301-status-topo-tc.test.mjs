/**
 * v1.94: BD-9301 status-bar SC leftovers (矩形陣列／鏡像 tips) + Solid S1-face toast TC
 * (持久面名經上游變換以拓撲順序追蹤解析).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { catalogKeyCount, LOCALES, tStatus } from '../src/i18n.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION 1.97; SW webcad-v1.97', () => {
  assert.match(version, /APP_VERSION = '1\.97'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.97/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

test('BD-9301 status tips pattern/mirror TC in store', () => {
  assert.match(store, /pattern: '矩形陣列：設 X\/Y 數量與間距 → 確定'/)
  assert.match(store, /mirror: '鏡像：設鏡像面／偏移 → 確定'/)
  assert.match(store, /cpattern: '環形陣列：設軸／數量／角度 → 確定'/)
  assert.equal(store.includes("pattern: '矩形阵列：设"), false)
  assert.equal(store.includes("mirror: '镜像：设"), false)
  assert.equal(store.includes('数量与间距'), false)
})

test('Solid S1-face / topology toast TC in worker', () => {
  assert.ok(worker.includes('持久面名經上游變換以拓撲順序追蹤解析（真拓撲命名 S1-面）'))
  assert.ok(worker.includes('持久邊名經上游變換以拓撲順序追蹤解析（真拓撲命名 S1）'))
  assert.equal(worker.includes("buildWarnings.push('持久面名经上游变换以拓扑顺序追踪解析（真拓扑命名 S1-面）')"), false)
  assert.equal(worker.includes("buildWarnings.push('持久边名经上游变换以拓扑顺序追踪解析（真拓扑命名 S1）')"), false)
  // user-visible push strings must be TC (comments may still mention 拓扑)
  assert.match(worker, /buildWarnings\.push\('持久面名經上游變換以拓撲順序追蹤解析（真拓撲命名 S1-面）'\)/)
})

test('BD-9301 + S1 toast tStatus zh-HK / zh-CN / en', () => {
  const samples = [
    ['矩形陣列：設 X/Y 數量與間距 → 確定', /矩形阵列/, 'Rectangular pattern'],
    ['鏡像：設鏡像面／偏移 → 確定', /镜像/, 'Mirror:'],
    ['持久面名經上游變換以拓撲順序追蹤解析（真拓撲命名 S1-面）', /持久面名经/, 'Persistent face'],
  ]
  for (const [tc, scRe, enPart] of samples) {
    assert.equal(tStatus(tc, 'zh-HK'), tc)
    assert.match(tStatus(tc, 'zh-CN'), scRe)
    const en = tStatus(tc, 'en')
    assert.ok(en.includes(enPart), `${tc} EN got ${JSON.stringify(en)}`)
  }
  assert.equal(traditionalToSimplified('陣列'), '阵列')
  assert.equal(traditionalToSimplified('鏡像'), '镜像')
  assert.equal(traditionalToSimplified('變換'), '变换')
  assert.ok(i18n.includes('v1.95'))
})
