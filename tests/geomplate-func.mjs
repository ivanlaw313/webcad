import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)
// 起 box，取顶面 4 条边 + 各自相邻侧面 → BridgeG1（G1 相切封盖）
const box = makeBaseBox(40, 40, 20)
const faces = box.faces
const top = faces.find(f => { try { const c = f.center; return Math.abs(c.z - 20) < 0.5 } catch { return false } })
console.log('top face found?', !!top, 'total faces', faces.length)
const topEdges = top ? top.edges : []
console.log('top edges', topEdges.length)
// 每条顶边嘅相邻侧面（非 top）
const adjFaces = topEdges.map(e => {
  const em = e.pointAt(0.5)
  return faces.find(f => f !== top && (() => { try { for (const fe of f.edges) { const m = fe.pointAt(0.5); if (Math.hypot(m.x-em.x,m.y-em.y,m.z-em.z) < 1e-6) return true } } catch{} return false })())
})
console.log('adj faces resolved', adjFaces.filter(Boolean).length)
const edgeW = topEdges.map(e => e.wrapped)
const faceW = adjFaces.map(f => f && f.wrapped ? f.wrapped : null)
let res
try { res = OC.PlateWrapper.BridgeG1(edgeW, faceW, true, 3, 15, 2, 1e-4, 1e-2) } catch(e){ res = 'THROW:'+(e&&e.message) }
const isNull = res && res.IsNull ? res.IsNull() : 'n/a'
console.log('BridgeG1 returned:', typeof res, 'IsNull?', isNull)
// kernel 存活验证（BridgeG1 后仲可以 make box）
try { const b2 = makeBaseBox(5,5,5); console.log('kernel ALIVE after BridgeG1 (made box vol ok)', !!b2) } catch(e){ console.log('kernel DEAD:', e&&e.message) }
