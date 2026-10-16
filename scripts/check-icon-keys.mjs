#!/usr/bin/env node
/** CLI: ensure CORE16 + offset icon keys exist in src/icons.tsx */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ic = readFileSync(join(root, 'src/icons.tsx'), 'utf8')
const ribbon = readFileSync(join(root, 'src/ribbon.ts'), 'utf8')
const keys = new Set([...ic.matchAll(/^\s{2}([A-Za-z][A-Za-z0-9_]*):/gm)].map((m) => m[1]))
const need = [
  'extrude','revolve','sweep','loft','emboss','hole','cylinder','cone','pattern','cpattern',
  'mirror','thicken','presspull','fillet','chamfer','shell','combine','split','move',
  'offset','line','rect','circle','arc',
]
const missing = need.filter((k) => !keys.has(k))
const ribbonRefs = [...ribbon.matchAll(/icon:\s*'([^']+)'/g)].map((m) => m[1])
const ribbonMissing = [...new Set(ribbonRefs)].filter((k) => !keys.has(k))
if (missing.length || ribbonMissing.length) {
  console.error('FAIL missing paths:', missing, 'ribbon unresolved:', ribbonMissing)
  process.exit(1)
}
console.log('OK', need.length, 'CORE/sketch keys +', new Set(ribbonRefs).size, 'ribbon refs resolve')
