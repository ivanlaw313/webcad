// Minor-issue batch (v2.20 QA): i18n strings, export filename, split volume, ViewCube, thicken ribbon,
// loft ⚠ dedupe, popover clamp, swatch highlight. Source/pure-function checks only (no browser).
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tStatus } from '../src/i18n.ts'
import { roundFailLines, formatBuildWarnings, booleanSuccessStatus } from '../src/ui/featureStatus.ts'
import { splitVolumeNote, meshVolumeMm3, splitVolumeNoteForMesh } from '../src/ui/splitVolume.ts'
import { clampPopover } from '../src/ui/popoverClamp.ts'
import { WORKSPACES } from '../src/ribbon.ts'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const store = read('src/store.ts')
const viewport = read('src/components/Viewport.tsx')

test('1 boolean status/labels render Traditional in zh-HK', () => {
  assert.equal(tStatus('已合并「A」', 'zh-HK'), '已合併「A」')
  assert.equal(tStatus('活动实体', 'zh-HK'), '活動實體')
  assert.match(booleanSuccessStatus({ kind: 'combine', op: 'join', toolCount: 1 }, 'zh-HK'), /^已合併：活動實體/)
  assert.doesNotMatch(store, /const opLbl = op === 'union' \? '合并'/)
  assert.match(store, /let name = '活動實體'/)
  assert.match(read('src/components/LoadingBar.tsx'), /tStatus\(status \|\| '處理中…', lang\)/)
  assert.match(read('src/components/PromptDialog.tsx'), /\{tx\(dlg\.msg\)\}/)
  assert.match(viewport, /\{tStatus\(row\.value, lang\)\}/)
})

test('2 fillet/chamfer failure banner localized; chamfer OK = 確定', () => {
  const hk = roundFailLines('zh-HK')
  assert.equal(hk.length, 3)
  assert.ok(hk.every((l) => !/[A-Za-z]{4,}/.test(l)), hk.join('|'))
  assert.match(hk[2], /相切鏈/)   // CORE16 #3：與倒角面板「相切鏈」一致、正式書面語
  assert.equal(roundFailLines('en')[0], '1 error(s)')
  assert.doesNotMatch(viewport, /<div>1 error\(s\)<\/div>/)
  assert.doesNotMatch(viewport, /edgeRoundPick === 'chamfer' \? 'OK'/)
})

test('3 export status names the downloaded file', () => {
  assert.doesNotMatch(store, /已匯出 webcad-body\.(stl|step)/)
  assert.match(store, /triggerDownload\(buf, stlName, 'model\/stl'\)[\s\S]{0,80}已匯出 \$\{stlName\}/)
  assert.match(store, /triggerDownload\(buf, stepName, 'application\/step'\)[\s\S]{0,80}已匯出 \$\{stepName\}/)
})

test('4/5 properties panel refreshes on body change and yields to command dialogs', () => {
  assert.match(viewport, /propsMeshSeen\.current === bodyMesh/)
  assert.match(viewport, /right: propsCommandOpen \? 296 : 12/)
  assert.match(read('src/components/Timeline.tsx'), /key=\{`\$\{sel\.id\}:\$\{meta\.field\}:/)
})

test('6 ViewCube enlarged + refits after click; ViewRig uses bounding sphere', () => {
  assert.match(viewport, /const VIEWCUBE_SCALE = 4 \/ 3/)
  assert.match(viewport, /<FittingViewCube \/>/)
  assert.match(viewport, /fitKeepDirection\(camera, controls\)/)
  assert.match(read('src/components/SketchLayer.tsx'), /r = Math\.max\(0\.5 \* Math\.hypot\(maxX - minX, maxY - minY, maxZ - minZ\), 10\)/)
})

test('7 split status reports total volume', () => {
  // 10×10×10 cube (12 tris) = 1000 mm³
  const V = [0,0,0, 10,0,0, 10,10,0, 0,10,0, 0,0,10, 10,0,10, 10,10,10, 0,10,10]
  const T = [0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7]
  assert.ok(Math.abs(meshVolumeMm3(V, T) - 1000) < 1e-6)
  assert.equal(splitVolumeNote(8000, 20000), '（活動體 8.00 cm³ · 合共 20.00 cm³）')
  assert.equal(splitVolumeNoteForMesh({ vertices: V, triangles: T, parked: [{ vertices: V, triangles: T }] }), '（活動體 1.00 cm³ · 合共 2.00 cm³）')
  assert.match(store, /d\.kind === 'splitbody'\) \{ const note = splitVolumeNoteForMesh/)
})

test('8 thicken exposed as a quick tool in SOLID › CREATE with thicken icon', () => {
  const create = WORKSPACES.SOLID.panels.find((p) => p.name === 'CREATE').tools
  const t = create.find((x) => x.id === 'thicken')
  assert.ok(t && t.quick && t.icon === 'thicken' && t.label === '加厚')
  assert.match(store, /case 'thicken':/)
})

test('9 rebuild warnings carry a single ⚠ and no duplicates', () => {
  assert.equal(formatBuildWarnings(['⚠ 放样：A', '⚠ 放样：A', 'B']), '　⚠ 放样：A；B')
  assert.equal(formatBuildWarnings([]), '')
  assert.doesNotMatch(formatBuildWarnings(['⚠ x']), /⚠ ⚠/)
})

test('10 popovers clamp to the viewport (1280px appearance picker case)', () => {
  const p = clampPopover({ left: 1290, right: 1318, top: 30, bottom: 56 }, { width: 296 }, { width: 1280, height: 720 }, { align: 'end' })
  assert.ok(p.left >= 8 && p.left + 296 <= 1280 - 8, JSON.stringify(p))
  const q = clampPopover({ left: -50, right: -20, top: 700, bottom: 715 }, { width: 200 }, { width: 1280, height: 720 })
  assert.equal(q.left, 8)
  assert.ok(q.top <= 720 - 160)
  assert.match(read('src/components/Ribbon.tsx'), /clampPopover\(a, \{ width: el\.offsetWidth \}/)
  assert.match(read('src/components/MaterialSwatchPicker.tsx'), /position: 'fixed', left: place\.left, top: place\.top/)
})

test('11 selected appearance swatch has a visible border + ring', () => {
  const src = read('src/components/MaterialSwatchPicker.tsx')
  assert.match(src, /aria-pressed=\{sel\}/)
  assert.match(src, /border: '2px solid ' \+ \(sel \? SEL_BORDER : 'transparent'\), boxShadow: sel \? SEL_RING : 'none'/)
})
