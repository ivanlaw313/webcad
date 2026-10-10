#!/usr/bin/env node
// FISHING14 E：選組件2 → 物理材質鋼 → HUD／物理屬性／BOM 同密度；bodyDensity 仍 2.7；裝配總質量按件加總。
import { launch } from './e2e-lib.mjs'
const { page, ok, finish } = await launch({ port: Number(process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 4401) })
const g = (fn, a) => page.evaluate(fn, a)
try {
  await g(async () => { window.useApp.setState({ ...window.useApp.getInitialState() }, true) })
  await page.waitForTimeout(200)
  // Two cubes as components: plate 80×60×10 (=48 cm³), shaft 10×10×40 (=4 cm³)
  await g(() => {
    const cube = (sx, sy, sz) => {
      const v = [0, 0, 0, sx, 0, 0, sx, sy, 0, 0, sy, 0, 0, 0, sz, sx, 0, sz, sx, sy, sz, 0, sy, sz]
      const t = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
      return { vertices: v, triangles: t, normals: new Array(v.length).fill(0) }
    }
    window.useApp.setState({
      components: [
        { id: 'C1', name: '組件1', mesh: cube(80, 60, 10), pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' },
        { id: 'C2', name: '組件2', mesh: cube(10, 10, 40), pos: [40, 0, 20], rot: [0, 0, 0], color: '#888' },
      ],
      componentDefs: [],
      bodyDensity: 2.7,
      physMatName: '',
      selectedComponent: 'C2',
      lang: 'zh-HK',
      bomDialog: null,
    })
  })
  await g(() => window.useApp.getState().setPhysicalMaterial('钢'))
  const after = await g(() => {
    const s = window.useApp.getState()
    const c2 = s.components.find((c) => c.id === 'C2')
    return { dens: s.bodyDensity, phys: s.physMatName, mat: c2?.material, color: c2?.color, status: s.status }
  })
  ok('steel on selected component; bodyDensity 2.7; physMatName empty', after.dens === 2.7 && after.phys === '' && after.mat === '钢', after)
  ok('status formal 鋼', /鋼/.test(after.status) && /7\.85/.test(after.status), after.status)

  await g(async () => { await window.useApp.getState().openPropertiesDialog('C2') })
  const props = await g(() => {
    const d = window.useApp.getState().propsDialogData
    const dens = d?.rows?.find((r) => r.label === '密度')?.value
    const mat = d?.rows?.find((r) => r.label === '材質')?.value
    const massG = (d?.massProps?.mass ?? 0) * 1e6
    return { dens, mat, massG }
  })
  ok('props density 7.850 + 鋼 + mass ~31.4', props.dens === '7.850 g/cm³' && props.mat === '鋼' && Math.abs(props.massG - 31.4) < 0.5, props)

  await g(() => window.useApp.getState().openBOM())
  const bom = await g(() => {
    const d = window.useApp.getState().bomDialog
    const hdr = d.rows[0]
    const iMat = hdr.indexOf('材質'), iDen = hdr.indexOf('密度 (g/cm³)'), iMass = hdr.indexOf('單件質量 (g)'), iSub = hdr.indexOf('小計質量 (g)')
    const by = Object.fromEntries(d.rows.filter((r) => /^\d+$/.test(r[0])).map((r) => [r[2], r]))
    const tot = d.rows.find((r) => r[0] === '合計')
    return {
      summary: d.summary,
      c1: { mat: by['組件1'][iMat], den: by['組件1'][iDen], mass: by['組件1'][iMass] },
      c2: { mat: by['組件2'][iMat], den: by['組件2'][iDen], mass: by['組件2'][iMass] },
      totMass: tot[iSub],
    }
  })
  ok('BOM mixed: 鋁 default + 鋼', bom.c1.mat === '鋁（預設）' && bom.c1.den === '2.70' && bom.c2.mat === '鋼' && bom.c2.den === '7.85', bom)
  const expectTot = 48 * 2.7 + 4 * 7.85
  ok('BOM total mass sums per-body densities', Math.abs(Number(bom.totMass) - expectTot) < 0.2, { tot: bom.totMass, expectTot, summary: bom.summary })
  ok('BOM summary says 按各組件材質密度', /按各組件材質密度/.test(bom.summary), bom.summary)

  const asm2 = await g(() => {
    const s = window.useApp.getState()
    // Inline same helper as Viewport
    const densOf = (c) => {
      const m = window.useApp.getState() // MATERIALS not on window
      return c.material === '钢' ? 7.85 : (c.material === '铝' ? 2.7 : s.bodyDensity)
    }
    let gm = 0
    const set = new Set()
    for (const c of s.components) {
      // vol from mesh: plate 80*60*10=48000 mm³, shaft 4000
      const v = c.mesh.vertices
      let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
      for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { const x = v[i + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x }
      const vol = (mx[0] - mn[0]) * (mx[1] - mn[1]) * (mx[2] - mn[2]) // AABB vol for axis-aligned cubes
      const cd = densOf(c)
      set.add(cd)
      gm += (vol / 1000) * cd
    }
    return { gm, mixed: set.size > 1, dens: [...set] }
  })
  ok('assembly total ~161.8 g mixed dens', Math.abs(asm2.gm - expectTot) < 0.5 && asm2.mixed, asm2)

  await g(async () => { await window.useApp.getState().undo() })
  const und = await g(() => {
    const c2 = window.useApp.getState().components.find((c) => c.id === 'C2')
    return { mat: c2?.material, dens: window.useApp.getState().bodyDensity }
  })
  ok('undo clears component material; dens still 2.7', und.mat == null && und.dens === 2.7, und)
} catch (e) {
  ok('exception', false, String(e && e.stack || e))
}
await finish()
