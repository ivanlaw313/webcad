/**
 * v1.37: Shell (and Fillet/Chamfer) success toasts → proper Chinese under EN tStatus.
 *
 * LIVE @1.36 hybrid: `Done: shell Wall 2 (向内, 开 1 个selected 面, 切线链)`
 * Root: global split/join tStatus + short tokens (已/抽壳/壁厚/所选) carving inside longer phrases.
 * Fix: shellSuccessStatus builder + long STATUS_PHRASES_X guards + LTR longest-match tStatus.
 * CLEAN semantics unchanged (no 备用/型腔/其他开口).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tStatus } from '../src/i18n.ts'
import { shellSuccessStatus } from '../src/ui/featureStatus.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const i18nSrc = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.37+', () => {
  assert.match(version, /APP_VERSION = '1\.3[7-9]'|APP_VERSION = '1\.[4-9]\d'/)
})

test('commitShell uses shellSuccessStatus helper', () => {
  assert.match(storeSrc, /import \{[^}]*shellSuccessStatus[^}]*\} from '\.\/ui\/featureStatus'/)
  assert.match(storeSrc, /shellSuccessStatus\(\{[\s\S]*?thickness:\s*th[\s\S]*?tangentChain:/)
})

test('tStatus is LTR longest-match (not global split/join)', () => {
  assert.match(i18nSrc, /s\.startsWith\(pair\[0\], i\)|s\.startsWith\(hit/)
  assert.match(i18nSrc, /v1\.37/)
  assert.doesNotMatch(i18nSrc, /out\.split\(zh\)\.join\(en\)/)
})

test('i18n guards: shell success Chinese identities present', () => {
  assert.match(i18nSrc, /'已抽壳 壁厚': '已抽壳 壁厚'/)
  assert.match(i18nSrc, /'个所选面': '个所选面'/)
  assert.match(i18nSrc, /'切线链开': '切线链开'/)
})

test('shellSuccessStatus builds Chinese CLEAN pattern', () => {
  const open = shellSuccessStatus({
    thickness: 2,
    dir: 'inside',
    shellType: 'open',
    openCount: 1,
    tangentChain: true,
  })
  assert.equal(open, '已抽壳 壁厚 2（向内，开 1 个所选面，切线链开）')
  assert.match(open, /已抽壳 壁厚 2/)
  assert.doesNotMatch(open, /备用|型腔|其他开口|未收敛|Done:|shell Wall|selected/)

  const closed = shellSuccessStatus({
    thickness: 1.5,
    dir: 'both',
    shellType: 'closed',
    openCount: 0,
    tangentChain: false,
  })
  assert.equal(closed, '已抽壳 壁厚 1.5（两侧，封闭实体）')
})

test('EN tStatus keeps Chinese shell success (no Done:/shell Wall/selected)', () => {
  const raw = shellSuccessStatus({
    thickness: 2,
    dir: 'inside',
    shellType: 'open',
    openCount: 1,
    tangentChain: true,
  })
  assert.equal(tStatus(raw, 'zh'), raw)

  const en = tStatus(raw, 'en')
  assert.match(en, /已抽壳 壁厚 2/)
  assert.match(en, /向内/)
  assert.match(en, /所选面/)
  assert.match(en, /切线链开/)
  assert.doesNotMatch(en, /Done:/)
  assert.doesNotMatch(en, /shell Wall/)
  assert.doesNotMatch(en, /selected/)
  // Must not resurrect soft/fallback wording
  assert.doesNotMatch(en, /备用|型腔|其他开口|未收敛/)
})

test('EN tStatus keeps Chinese fillet/chamfer success (no Done:/fillet hybrid)', () => {
  const fillet = '已对 3 条棱 倒圆角 R2（时间轴可改）'
  const chamfer = '已对 2 条棱 倒角 C1（时间轴可改）'
  const face = '已建立面圆角 R4（两张相邻面共同边）'
  for (const raw of [fillet, chamfer, face]) {
    const en = tStatus(raw, 'en')
    assert.doesNotMatch(en, /Done:/)
    assert.doesNotMatch(en, /\bfillet\b/i)
    assert.doesNotMatch(en, /\bchamfer\b/i)
    assert.match(en, /已/)
  }
  assert.match(tStatus(fillet, 'en'), /倒圆角/)
  assert.match(tStatus(chamfer, 'en'), /倒角/)
  assert.match(tStatus(face, 'en'), /已建立面圆角/)
})
