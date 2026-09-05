import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('curvature analysis is deferred until an Inspect workflow needs it', () => {
  const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(viewport, /import \{ CurvatureOverlay, CurvatureCombOverlay, MinRadiusMarker \} from '\.\/CurvatureOverlay'/)
  assert.match(viewport, /lazy\(\(\) => import\('\.\/CurvatureOverlay'\)/)
  assert.match(viewport, /const needsCurvatureAnalysis = inspectMode \|\| \['curv', 'gausscurv', 'kmax', 'kmin', 'comb'\]\.includes\(inspectShade\)/)
  assert.match(viewport, /needsCurvatureAnalysis && <Suspense fallback=\{null\}><CurvatureAnalysisOverlays \/><\/Suspense>/)
})

test('view PNG export reuses the mounted viewport instead of dynamically importing it again', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(store, /window\.dispatchEvent\(new Event\('webcad:export-view-png'\)\)/)
  assert.doesNotMatch(store, /import\('\.\/components\/Viewport'\)/)
  assert.match(viewport, /window\.addEventListener\('webcad:export-view-png', exportViewPNG\)/)
})

test('engineering drawings load only after a drawing has been requested', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /import DrawingPanel from '\.\/components\/DrawingPanel'/)
  assert.match(app, /const DrawingPanel = lazy\(\(\) => import\('\.\/components\/DrawingPanel'\)\)/)
  assert.match(app, /const drawingOpen = useApp\(\(s\) => s\.drawingOpen\)/)
  assert.match(app, /\{drawingOpen && <ErrorBoundary[\s\S]*?<DrawingPanel \/><\/Suspense><\/ErrorBoundary>\}/)
})

test('closed auxiliary panels stay out of the initial bundle', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  for (const [component, state] of [['HelpPanel', 'helpOpen'], ['CommandPalette', 'cmdPaletteOpen'], ['AiCopilot', 'aiOpen']]) {
    const lazyName = `${component}Lazy`
    assert.match(app, new RegExp(`const ${lazyName} = lazy\\(\\(\\) => import\\('\\.\\/components\\/${component}'\\)\\)`))
    assert.match(app, new RegExp(`const ${state} = useApp\\(\\(s\\) => s\\.${state}\\)`))
    assert.match(app, new RegExp(`\\{${state} && <Suspense fallback=\\{null\\}><${lazyName} \\/><\\/Suspense>\\}`))
  }
})
