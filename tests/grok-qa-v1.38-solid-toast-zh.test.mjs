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
const zhHK = readFileSync(new URL('../src/i18n/locales/zh-HK.ts', import.meta.url), 'utf8')

const noHybrid = (en) => {
  // Catalog EN is real English (boolean/body/extrude OK). Only ban Done: shred hybrids.
  assert.doesNotMatch(en, /Done:/)
  assert.doesNotMatch(en, /Bake into part solid/)
  assert.doesNotMatch(en, /shell Wall/)
}

test('APP_VERSION is 1.38+', () => {
  assert.match(version, /APP_VERSION = '2.20'/)
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
  assert.ok(/已切割（(?:布尔减|布爾減)）— (?:真实|真實) OCCT B-rep|status\.cutDone|status\.extrudeCutDone/.test(i18nSrc + zhHK), 'cutDone')
  assert.ok(/已拉伸出(?:实体|實體).{0,4}(?:真实|真實) OCCT B-rep|status\.extrudeDone/.test(i18nSrc + zhHK), 'extrudeDone')
  assert.ok(/已在顶面叠加拉伸特征|已在頂面疊加拉伸特徵|status\.extrudeStackDone/.test(i18nSrc + zhHK), 'stackDone')
  assert.match(i18nSrc, /'(?:已实体布尔|已實體布爾)：(?:活动实体|活動實體)': '(?:已实体布尔|已實體布爾)：(?:活动实体|活動實體)'/)
  assert.match(i18nSrc, /'已實體布爾：活動實體': '已實體布爾：活動實體'/)
  assert.match(i18nSrc, /'已合併：活動實體': '已合併：活動實體'/)
  assert.match(i18nSrc, /'(?:已合并|已合併)：(?:活动实体|活動實體)': '(?:已合并|已合併)：(?:活动实体|活動實體)'/)
  assert.match(i18nSrc, /'(?:已对所有棱倒圆角|已對所有棱倒圓角)': '(?:已对所有棱倒圆角|已對所有棱倒圓角)'/)
  assert.match(i18nSrc, /'(?:已对所有棱倒角|已對所有棱倒角)': '(?:已对所有棱倒角|已對所有棱倒角)'/)
})

test('tStatus remains LTR longest-match (no split/join regress)', () => {
  assert.match(i18nSrc, /export function tStatus|function tStatusOnce/)
  assert.doesNotMatch(i18nSrc, /out\.split\(zh\)\.join\(en\)/)
})

test('extrude/cut builders → Chinese zh-HK + proper EN (no Done: shred)', () => {
  for (const op of /** @type {const} */ (['new', 'cut', 'stack'])) {
    const zh = extrudeSuccessStatus({ op }, 'zh-HK')
    assert.match(zh, /^已/)
    assert.doesNotMatch(zh, /Done:/)
    const en = extrudeSuccessStatus({ op }, 'en')
    noHybrid(en)
    assert.doesNotMatch(en, /Done:/)
    assert.match(en, /[A-Za-z]/)
  }
  assert.match(extrudeSuccessStatus({ op: 'cut' }, 'zh-HK'), /已切割（(?:布尔减|布爾減)）/)
  assert.match(extrudeSuccessStatus({ op: 'new' }, 'zh-HK'), /(?:已拉伸出实体|已拉伸出實體)/)
  assert.match(extrudeSuccessStatus({ op: 'stack' }, 'zh-HK'), /(?:已在顶面叠加拉伸特征|已在頂面疊加拉伸特徵)/)
  assert.match(extrudeSuccessStatus({ op: 'cut' }, 'en'), /Cut|boolean/i)
})

test('multi-profile extrude/cut → Chinese zh-HK + EN, no Done:/profile', () => {
  const cut = multiProfileExtrudeStatus({ op: 'cut', count: 2, groupNodes: 2 }, 'zh-HK')
  const neu = multiProfileExtrudeStatus({ op: 'new', count: 2, holes: 1 }, 'zh-HK')
  for (const raw of [cut, neu]) {
    assert.match(raw, /已/)
    assert.match(raw, /(?:真实|真實) OCCT B-rep/)
    assert.doesNotMatch(raw, /Done:/)
  }
  const cutEn = multiProfileExtrudeStatus({ op: 'cut', count: 2, groupNodes: 2 }, 'en')
  noHybrid(cutEn)
  assert.doesNotMatch(cutEn, /Done:/)
})

test('boolean/fuse/new-body → Chinese zh-HK + proper EN', () => {
  const body = booleanSuccessStatus({ kind: 'body', op: 'cut' }, 'zh-HK')
  const fuse = booleanSuccessStatus({ kind: 'combine', op: 'join', toolCount: 2 }, 'zh-HK')
  const nb = newBodySuccessStatus(2, 'zh-HK')
  assert.match(body, /已實體布爾|(?:已实体布尔|已實體布爾)/)
  assert.match(fuse, /已合併：活動實體|(?:已合并|已合併)/)
  assert.match(nb, /已開新實體|(?:已开新实体|已開新實體)/)
  for (const raw of [body, fuse, nb]) assert.doesNotMatch(raw, /Done:/)
  const bodyEn = booleanSuccessStatus({ kind: 'body', op: 'cut' }, 'en')
  noHybrid(bodyEn)
  assert.doesNotMatch(bodyEn, /Done:/)
  assert.match(bodyEn, /boolean|Body/i)
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

test('v1.37 shell CLEAN zh-HK + proper EN (no Done: shred)', () => {
  const raw = shellSuccessStatus({
    thickness: 2,
    dir: 'inside',
    shellType: 'open',
    openCount: 1,
    tangentChain: true,
  }, 'zh-HK')
  assert.match(raw, /已抽殼 壁厚/)
  assert.doesNotMatch(raw, /备用|型腔|其他开口|未收敛/)
  const en = shellSuccessStatus({
    thickness: 2,
    dir: 'inside',
    shellType: 'open',
    openCount: 1,
    tangentChain: true,
  }, 'en')
  assert.doesNotMatch(en, /Done:/)
  assert.match(en, /Shell|wall|thickness/i)
})
