// Live capability probe for the exact WASM shipped to the browser.  This is
// intentionally not a release gate: an unavailable constructor is a planning
// fact, not a user-facing failure.  Keep it small so it can be rerun whenever
// the OCCT build changes.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))

const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
const has = (prefix) => Object.keys(OC).filter((k) => k === prefix || k.startsWith(prefix + '_')).sort()
for (const name of ['BRepAlgoAPI_Splitter', 'BRepBuilderAPI_MakePolygon', 'BRepBuilderAPI_MakeFace', 'BRepFeat_SplitShape', 'BRepOffsetAPI_MakeFilling', 'BRepAlgoAPI_Section']) {
  console.log(`${name}: ${has(name).join(', ') || '(unavailable)'}`)
}
