import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { VISUAL_STYLES, visualStyleToRender } from '../src/cad/viewModel.ts'

const viewport = fs.readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('B-rep visual styles retain shaded face modes', () => {
  assert.equal(visualStyleToRender('shadedVisible').wireframe, false)
  assert.equal(visualStyleToRender('shadedHidden').edges, 'hidden')
  assert.equal(VISUAL_STYLES.length, 6)
})

test('B-rep display has a direct shaded-visible recovery control', () => {
  assert.match(viewport, /onClick=\{\(\) => setVisualStyle\('shadedVisible'\)\}/)
  assert.match(viewport, /B-rep：實體面加可見邊/)
  assert.match(viewport, /B-rep 视觉样式/)
})

test('Sketch keeps a lower display-mode entry even when its toolbar is moved or collapsed', () => {
  assert.match(viewport, /className="sketch-display-dock"/)
  assert.match(viewport, /data-testid="sketch-visual-style-trigger"/)
  for (const style of VISUAL_STYLES) {
    assert.match(viewport, new RegExp('data-testid=\\{`sketch-visual-style-\\$\\{vs\\}`\\}'))
  }
})

test('shaded hidden edges are depth-occluded instead of redrawing all edges', () => {
  assert.match(viewport, /GreaterDepth/)
  assert.match(viewport, /renderOrder=\{hidden \? 2 : 1\}/)
  assert.match(viewport, /depthFunc=\{GreaterDepth\}/)
  assert.match(viewport, /depthTest/)
  assert.match(viewport, /setAttribute\('lineDistance'/)
  assert.match(viewport, /lineDashedMaterial/)
})

test('wire modes that distinguish visible or hidden edges retain an invisible depth prepass', () => {
  // A transparent wire body cannot write colour, but the visible-only and
  // hidden-line variants must still populate depth before their B-rep lines.
  const block = viewport.slice(viewport.indexOf('colorWrite={!pickOnly'), viewport.indexOf('side={xray', viewport.indexOf('colorWrite={!pickOnly')))
  const color = block.match(/colorWrite=\{([^}]+)\}/)?.[1]
  const depth = block.match(/depthWrite=\{([^}]+)\}/)?.[1]
  assert.ok(color && depth, 'body material exposes colour/depth controls')
  const evaluate = (expression, pickOnly, wire, edgeDisplay) => Function('pickOnly','wire','edgeDisplay','xray','skSee','feaGhost','compOpacity','frozen','material', 'return ('+expression+')')(pickOnly,wire,edgeDisplay,false,false,false,1,false,{opacity:1})
  for (const edgeDisplay of ['off','visible','hidden']) {
    assert.equal(evaluate(color,false,true,edgeDisplay),false)
    assert.equal(evaluate(depth,false,true,edgeDisplay),edgeDisplay !== 'off')
    assert.equal(evaluate(color,true,false,edgeDisplay),false,'pick surface cannot obscure preview')
    assert.equal(evaluate(depth,true,false,edgeDisplay),false,'pick surface cannot occlude preview edges')
  }
  assert.equal(evaluate(color,false,false,'visible'),true)
  assert.equal(evaluate(depth,false,false,'visible'),true)
})
