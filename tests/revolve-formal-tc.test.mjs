/**
 * Revolve dialog / status Formal Traditional (HK written) — no SC 两侧对称 leftovers.
 * APP_VERSION stays 2.20.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { simplifiedToTraditionalHK, SC2TC_HK_PHRASES } from '../src/i18n/sc2tcHK.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const fs = readFileSync(new URL('../src/ui/featureStatus.ts', import.meta.url), 'utf8')

test('APP_VERSION 2.20', () => {
  assert.match(version, /APP_VERSION = '2\.20'/)
})

test('Revolve dialog checkbox label is Formal TC 兩側對稱', () => {
  assert.match(vp, /tStatus\('兩側對稱', lang\)/)
  assert.doesNotMatch(vp, /tStatus\('两侧对称', lang\)/)
  assert.match(vp, /兩側對稱：部分角旋轉時把角度均分跨越截面平面兩側/)
})

test('Revolve success status uses Formal TC (兩側對稱 / 繞 / 軸 / 車槽)', () => {
  assert.match(store, /·兩側對稱/)
  assert.doesNotMatch(store, /·两侧对称/)
  assert.match(store, /切割（車槽）/)
  assert.match(store, /生成實體/)
  assert.match(store, /已旋轉\$\{verb\}（繞 \$\{axName\}/)
  assert.match(store, /任意軸\(\$\{axisSpec\.axisV/)
})

test('extrudeExtraNote symmetric/twist/through notes are Formal TC', () => {
  assert.match(fs, /f\.symmetric \? '（對稱）'/)
  assert.match(fs, /（扭轉 \$\{f\.twist\}°）/)
  assert.match(fs, /'（貫通）'/)
  assert.doesNotMatch(fs, /（对称）/)
  assert.doesNotMatch(fs, /（扭转 /)
  assert.doesNotMatch(fs, /（贯通）/)
})

test('sc2tcHK maps 复合 → 複合 (ambiguous 复 phrase)', () => {
  assert.equal(SC2TC_HK_PHRASES['复合'], '複合')
  assert.equal(SC2TC_HK_PHRASES['复合体'], '複合體')
  assert.equal(simplifiedToTraditionalHK('复合体'), '複合體')
  assert.equal(simplifiedToTraditionalHK('两侧对称'), '兩側對稱')
})
