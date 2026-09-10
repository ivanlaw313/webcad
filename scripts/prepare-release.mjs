import { readFile, writeFile } from 'node:fs/promises'
const file = new URL('../src/version.ts', import.meta.url)
const source = await readFile(file, 'utf8')
const match = source.match(/APP_VERSION = '(\d+)\.(\d+)'/)
if (!match) throw new Error('Missing product release version')
const next = `${match[1]}.${Number(match[2]) + 1}`
await writeFile(file, source.replace(match[0], `APP_VERSION = '${next}'`))
console.log(`Prepared WebCAD version ${next}. Build and verify before publishing; retries keep this version.`)
