import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
const {useApp}=await import('../src/store.ts')

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')

function bodyAfter(anchor, size = 1000) {
  // AppState declares these methods before the Zustand implementation.  The
  // lifecycle contract must inspect the implementation, not the type line.
  const at = store.lastIndexOf(anchor)
  assert.ok(at >= 0, `missing store lifecycle anchor: ${anchor}`)
  return store.slice(at, at + size)
}

test('a new sketch begins in Select with Orbit navigation, never Rectangle draw', () => {
  assert.match(bodyAfter("startSketch: () =>", 900), /mode: 'pickplane', sketchTool: 'select', navTool: 'orbit'/)
  assert.match(bodyAfter('chooseSketchPlane: (plane)', 1100), /mode: 'sketch'[\s\S]*sketchTool: 'select', navTool: 'orbit'/)

  // Every face / mesh-face / datum-plane fresh-entry path must have the same
  // safe initial interaction.  Reopening an existing sketch is intentionally
  // outside this list and retains its normal Select state.
  for (const needle of [
    "mode: 'sketch', sketchPlane: 'XY', sketchArb: { o, xd, n: nn }, sketchBaseZ: 0, sketchTool: 'select', navTool: 'orbit'",
    "mode: 'sketch', sketchPlane: plane, sketchArb: null, sketchBaseZ: off, sketchTool: 'select', navTool: 'orbit'",
    "mode: 'sketch', sketchPlane: 'XY', sketchArb: JSON.parse(JSON.stringify(arb)) as AppState['sketchArb'], sketchBaseZ: 0, sketchTool: 'select', navTool: 'orbit'",
    "mode: 'sketch', sketchPlane: base, sketchArb: null, sketchBaseZ: offset, sketchTool: 'select', navTool: 'orbit'",
  ]) assert.ok(store.includes(needle), `fresh sketch entry must reset select/orbit: ${needle.slice(0, 55)}…`)
})

test('Escape steps back to Select and retains sketch; explicit exit restores Orbit navigation', () => {
  const shape={type:'circle',c:[40,30],r:10},profiles=[{type:'rect',a:[60,20],b:[80,40]}]
  useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'ellipse',navTool:'pan',sketchShape:structuredClone(shape),sketchProfiles:structuredClone(profiles)},true)
  assert.equal(useApp.getState().escSketch(),true)
  assert.equal(useApp.getState().mode,'sketch');assert.equal(useApp.getState().sketchTool,'select');assert.equal(useApp.getState().navTool,'pan')
  assert.deepEqual(useApp.getState().sketchShape,shape);assert.deepEqual(useApp.getState().sketchProfiles,profiles)
  assert.equal(useApp.getState().escSketch(),false);assert.equal(useApp.getState().mode,'sketch');assert.equal(useApp.getState().navTool,'pan')
  assert.deepEqual(useApp.getState().sketchShape,shape);assert.deepEqual(useApp.getState().sketchProfiles,profiles)
  assert.match(app, /s\.mode === 'sketch'\) \{ if \(!s\.escSketch\(\)\) useApp\.setState\(\{ status: '已取消选择 — 草图保留/)
  useApp.getState().exitSketchMode()
  assert.equal(useApp.getState().mode,'model');assert.equal(useApp.getState().navTool,'orbit');assert.equal(useApp.getState().sketchTool,'select')
  assert.deepEqual(useApp.getState().sketchShape,shape);assert.deepEqual(useApp.getState().sketchProfiles,profiles)
})
