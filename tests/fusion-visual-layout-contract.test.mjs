import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const draggable = readFileSync(new URL('../src/components/useDraggable.ts', import.meta.url), 'utf8')

test('Fusion ribbon keeps the workspace chrome stable while tool groups scroll', () => {
  assert.match(ribbon, /className="ribbon-shell"/)
  assert.match(css, /\.ribbon-shell\s*\{[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s)
  assert.match(ribbon, /className="ribbon-main"/)
  assert.match(css, /\.ribbon-main\s*\{[^}]*flex:\s*1[^}]*min-width:\s*0[^}]*overflow:\s*hidden/s)
  assert.match(css, /\.ribbon-panels\s*\{[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden[^}]*overscroll-behavior-x:\s*contain/s)
  assert.match(css, /\.panel\s*\{[^}]*flex:\s*0 0 auto[^}]*min-width:\s*max-content/s)
  assert.match(css, /\.ribbon-panels > \.panel:last-of-type \.panel-divider\s*\{\s*display:\s*none/s)
})

test('the top chrome cannot widen the CAD document on a normal laptop viewport', () => {
  assert.match(css, /\.topbar\s*\{[^}]*min-width:\s*0[^}]*overflow-x:\s*auto[^}]*overflow-y:\s*hidden/s)
  assert.match(css, /\.topbar\s*\{[^}]*overscroll-behavior-x:\s*contain/s)
})

test('desktop ribbon tabs and cascading menus remain inside a narrow viewport', () => {
  assert.match(css, /\.ribbon-tabs\s*\{[^}]*overflow-x:\s*auto[^}]*overscroll-behavior-x:\s*contain/s)
  assert.match(css, /\.ribbon-tab\s*\{[^}]*flex:\s*0 0 auto[^}]*white-space:\s*nowrap/s)
  assert.match(css, /\.panel-menu\s*\{[^}]*max-width:\s*calc\(100vw - 16px\)[^}]*max-height:\s*min\(480px,\s*calc\(100vh - 110px\)\)/s)
  assert.match(ribbon, /data-testid="ribbon-group-menu"/)
  assert.match(ribbon, /data-testid="ribbon-submenu"/)
  assert.match(ribbon, /r\.right > window\.innerWidth - 8/)
})

test('floating CAD panels have viewport-safe dimensions and theme-aware surfaces', () => {
  assert.match(css, /\.cmd-palette\s*\{[^}]*top:\s*min\(150px,\s*calc\(100vh - 180px\)\)[^}]*max-width:\s*calc\(100vw - 16px\)[^}]*max-height:\s*calc\(100vh - 16px\)/s)
  assert.match(css, /\.cmd-palette-body\s*\{[^}]*max-height:\s*min\(60vh,\s*calc\(100vh - 180px\)\)/s)
  assert.match(css, /\.joints-panel\s*\{[^}]*width:\s*min\(330px,\s*calc\(100vw - 28px\)\)[^}]*max-height:\s*min\(62vh,\s*calc\(100vh - 246px\)\)[^}]*background:\s*var\(--panel\)/s)
  assert.match(css, /\.params-panel\s*\{[^}]*width:\s*min\(290px,\s*calc\(100vw - 28px\)\)[^}]*max-height:\s*min\(60vh,\s*calc\(100vh - 164px\)\)[^}]*background:\s*var\(--panel\)/s)
  assert.match(css, /\.info-card\s*\{[^}]*background:\s*var\(--panel\)[^}]*max-width:\s*calc\(100vw - 28px\)[^}]*overflow:\s*auto/s)
})

test('narrow or short desktop windows reserve a reachable region above the timeline', () => {
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.joints-panel, \.joints-pill\s*\{\s*bottom:\s*166px/s)
  assert.match(css, /@media \(max-height: 680px\)[\s\S]*?\.joints-panel\s*\{\s*bottom:\s*118px[^}]*max-height:\s*calc\(100vh - 154px\)/s)
  assert.match(css, /@media \(max-height: 680px\)[\s\S]*?\.vp-navbar\s*\{\s*bottom:\s*54px/s)
})

test('display styles are discoverable and dragged panels remain recoverable after content grows', () => {
  assert.match(viewport, /aria-label=\{tStatus\('顯示方式', lang\)\}/)
  assert.match(viewport, /vp-display-label/)
  assert.match(css, /\.vp-display-menu\s*\{[^}]*min-width:\s*58px/s)
  assert.match(draggable, /ResizeObserver/)
  assert.match(draggable, /observer\.observe\(el\)/)
  assert.match(draggable, /boundWidth - Math\.min\(r\.width, boundWidth - 4\)/)
})
