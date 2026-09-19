/**
 * v1.38: Extrude/Cut/Boolean/Fuse (and related solid) success toasts → proper Chinese under EN tStatus.
 *
 * LIVE @1.37 still mangled: `Done: extrudeto make a body — real  OCCT B-rep`,
 * `Cut (Boolean subtract) done — true OCCT B-rep`, `Done: boolean: 活动body…`, `Merged : …`.
 * Fix: solid success builders + long STATUS_PHRASES_X guards (keep v1.37 LTR longest-match).
 * Do NOT regress Shell CLEAN / v1.36 join budgets / v1.35 DXF / v1.37 LTR matcher.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tStatus } from '../src/i18n.ts'
import {
  shellSuccessStatus,
  extrudeSuccessStatus,
  multiProfileExtrudeStatus,
  booleanSuccessStatus,
  newBodySuccessStatus,
} from '../src/ui/featureStatus.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const i18nSrc = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

const noHybrid = (en) => {
  assert.doesNotMatch(en, /Done:/)
  assert.doesNotMatch(en, /\bextrude\b/i)
  assert.doesNotMatch(en, /\bboolean\b/i)
  assert.doesNotMatch(en, /\bMerged\b/)
  assert.doesNotMatch(en, /\bbody\b/i)
  assert.doesNotMatch(en, /\bprofile\b/i)
  assert.doesNotMatch(en, /\bfillet\b/i)
  assert.doesNotMatch(en, /\bchamfer\b/i)
  assert.doesNotMatch(en, /\brevolve\b/i)
  assert.doesNotMatch(en, /\bloft\b/i)
  assert.doesNotMatch(en, /\bsweep\b/i)
  assert.doesNotMatch(en, /\bDraft\b/)
  assert.doesNotMatch(en, /\bthicken\b/i)
}

test('APP_VERSION is 1.38+', () => {
  assert.match(version, /APP_VERSION = '1\.3[89]'|APP_VERSION = '1\.[4-9]\d'/)
})

test('store uses solid success builders', () => {
  assert.match(storeSrc, /extrudeSuccessStatus\(/)
  assert.match(storeSrc, /multiProfileExtrudeStatus\(/)
  assert.match(storeSrc, /booleanSuccessStatus\(/)
  assert.match(storeSrc, /newBodySuccessStatus\(/)
  assert.match(storeSrc, /shellSuccessStatus\(/)
})

test('i18n v1.38 guards present (identity Chinese)', () => {
  assert.match(i18nSrc, /v1\.38/)
  assert.match(i18nSrc, /['\"]已切割（布尔减）— 真实 OCCT B-rep['\"]: ['\"]已切割（布尔减）— 真实 OCCT B-rep['\"]/)
  assert.match(i18nSrc, /'已拉伸出实体 — 真实 OCCT B-rep': '已拉伸出实体 — 真实 OCCT B-rep'/)
  assert.match(i18nSrc, /['\"]已在顶面叠加拉伸特征['\"]: ['\"]已在顶面叠加拉伸特征['\"]/)
  assert.match(i18nSrc, /'已实体布尔：活动实体': '已实体布尔：活动实体'/)
  assert.match(i18nSrc, /'已合并：活动实体': '已合并：活动实体'/)
  assert.match(i18nSrc, /'已对所有棱倒圆角': '已对所有棱倒圆角'/)
  assert.match(i18nSrc, /'已对所有棱倒角': '已对所有棱倒角'/)
})

test('tStatus remains LTR longest-match (no split/join regress)', () => {
  assert.match(i18nSrc, /s\.startsWith\(pair\[0\], i\)|s\.startsWith\(hit/)
  assert.doesNotMatch(i18nSrc, /out\.split\(zh\)\.join\(en\)/)
})

test('extrude/cut builders → Chinese, EN tStatus has no Done:', () => {
  for (const op of /** @type {const} */ (['new', 'cut', 'stack'])) {
    const raw = extrudeSuccessStatus({ op })
    assert.match(raw, /^已/)
    assert.doesNotMatch(raw, /Done:/)
    const en = tStatus(raw, 'en')
    noHybrid(en)
    assert.match(en, /已/)
  }
  assert.match(tStatus(extrudeSuccessStatus({ op: 'cut' }), 'en'), /已切割（布尔减）/)
  assert.match(tStatus(extrudeSuccessStatus({ op: 'new' }), 'en'), /已拉伸出实体/)
  assert.match(tStatus(extrudeSuccessStatus({ op: 'stack' }), 'en'), /已在顶面叠加拉伸特征/)
})

test('multi-profile extrude/cut → Chinese, no Done:/profile', () => {
  const cut = multiProfileExtrudeStatus({ op: 'cut', count: 2, groupNodes: 2 })
  const neu = multiProfileExtrudeStatus({ op: 'new', count: 2, holes: 1 })
  for (const raw of [cut, neu]) {
    const en = tStatus(raw, 'en')
    noHybrid(en)
    assert.match(en, /真实 OCCT B-rep/)
  }
})

test('boolean/fuse/new-body → Chinese, no Done:/boolean/Merged', () => {
  const body = booleanSuccessStatus({ kind: 'body', op: 'cut' })
  const fuse = booleanSuccessStatus({ kind: 'combine', op: 'join', toolCount: 2 })
  const nb = newBodySuccessStatus(2)
  for (const raw of [body, fuse, nb]) {
    const en = tStatus(raw, 'en')
    noHybrid(en)
    assert.match(en, /已/)
  }
  assert.match(tStatus(body, 'en'), /已实体布尔/)
  assert.match(tStatus(fuse, 'en'), /已合并：活动实体/)
  assert.match(tStatus(nb, 'en'), /已开新实体/)
})

test('revolve/loft/sweep/draft/thicken/all-edge fillet·chamfer guards', () => {
  const samples = [
    '已旋转出实体（绕 Z 360°）',
    '已放样 2 个截面（Z 0→20）',
    '已沿 5 点路径扫掠成实体（任意草图截面 — Fusion 式）',
    '已沿 5 点路径扫掠切割（草图截面）',
    '已拔模 10°（侧面，中性面 XY）',
    '已加厚该面 2mm（正向，独立实体薄板 — 要合并入主体用「实体布尔」）',
    '已对所有棱倒圆角 R2（时间轴可改半径）',
    '已对所有棱倒角 1mm（时间轴可改距离）',
  ]
  for (const raw of samples) {
    const en = tStatus(raw, 'en')
    noHybrid(en)
    assert.match(en, /已/)
  }
})

test('v1.37 shell CLEAN still Chinese under EN (no regress)', () => {
  const raw = shellSuccessStatus({
    thickness: 2,
    dir: 'inside',
    shellType: 'open',
    openCount: 1,
    tangentChain: true,
  })
  assert.match(raw, /已抽殼 壁厚 2/)
  assert.doesNotMatch(raw, /备用|型腔|其他开口|未收敛/)
  const en = tStatus(raw, 'en')
  assert.match(en, /已抽殼 壁厚 2/)
  assert.doesNotMatch(en, /Done:|shell Wall|selected/)
})
