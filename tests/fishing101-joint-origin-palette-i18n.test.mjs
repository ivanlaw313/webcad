/**
 * FISHING101: JointOriginPalette UI chrome — en/ja/zh-CN/zh-HK (not TC-only titles for JA/EN).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING101 JointOriginPalette has JA/ZH_CN/EN/ZH tables + normalizeLang pick', () => {
  const w = read('src/components/JointOriginPalette.tsx')
  assert.match(w, /const JA: JoChrome = \{/)
  assert.match(w, /ジョイント原点/)
  assert.match(w, /const ZH_CN: JoChrome = \{/)
  assert.match(w, /关节原点/)
  assert.match(w, /const EN: JoChrome = \{/)
  assert.match(w, /Joint origin/)
  assert.match(w, /const ZH: JoChrome = \{/)
  assert.match(w, /關節原點/)
  assert.match(w, /normalizeLang\(lang\)/)
  assert.match(w, /L === 'ja' \? JA/)
  assert.match(w, /pickJoChrome/)
  // Must not hardcode TC-only cmd-palette-head 關節原點 anymore
  assert.doesNotMatch(w, /<b>關節原點<\/b>/)
})

test('FISHING101 JointOriginPalette mode/hint chrome keys wired', () => {
  const w = read('src/components/JointOriginPalette.tsx')
  assert.match(w, /simple:/)
  assert.match(w, /twoFaces:/)
  assert.match(w, /twoEdges:/)
  assert.match(w, /hintSimple:/)
  assert.match(w, /hintFace1:/)
  assert.match(w, /hintFace2:/)
  assert.match(w, /hintEdge1:/)
  assert.match(w, /hintEdge2:/)
  assert.match(w, /\{chrome\.title\}/)
  assert.match(w, /\{chrome\.simple\}/)
  assert.match(w, /\{chrome\.twoFaces\}/)
  assert.match(w, /\{chrome\.twoEdges\}/)
  assert.match(w, /\{chrome\.footer\}/)
  assert.match(w, /2面の間/)
  assert.match(w, /Between two faces/)
})

test('FISHING101 F100 JointsPanel + MATERIALS + F94 demold prefix kept', () => {
  const jp = read('src/components/JointsPanel.tsx')
  const st = read('src/store.ts')
  const i18n = read('src/i18n.ts')
  assert.match(jp, /アセンブリジョイント/)
  assert.match(jp, /Assembly joints/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(i18n, /離型到達性|Demold Accessibility|脫模可達性/)
})
