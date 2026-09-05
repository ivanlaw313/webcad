import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const store = fs.readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbon = fs.readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

test('new and restored designs use a contrast-safe solid appearance', () => {
  assert.match(store, /bodyColor: '#4a7296'/)
  assert.doesNotMatch(store, /#b9c2cb/)
})

test('ribbon exposes a labelled immediate body-colour control', () => {
  assert.match(ribbon, /className="tb-color-control"/)
  assert.match(ribbon, /aria-label=\{en \? 'Body colour' :/)
  assert.match(ribbon, /onInput=\{\(e\) => setBodyColor\(e\.currentTarget\.value\)\}/)
  assert.match(ribbon, /onChange=\{\(e\) => setBodyColor\(e\.target\.value\)\}/)
})

test('viewport display menu retains a non-topbar appearance fallback', () => {
  const viewport = fs.readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(viewport, /data-testid="viewport-body-colour"/)
  assert.match(viewport, /body-colour-\$\{colour\.slice\(1\)\}/)
  assert.match(viewport, /setViewportBodyColor\('#4a7296'\)/)
})
