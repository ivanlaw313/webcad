// BUG-UI-002 / Save-Export P0: Save must prefer a durable File System Access
// write (or a hardened in-document anchor download), report cancel/failure
// without claiming success, and Open must refuse bad JSON without wiping.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const downloadSrc = readFileSync(new URL('../src/io/download.ts', import.meta.url), 'utf8')

function impl(name, next) {
  const needle = `  ${name}: `
  let start = -1
  let from = 0
  while (true) {
    const i = storeSrc.indexOf(needle, from)
    if (i < 0) break
    const window = storeSrc.slice(i, i + 120)
    // Skip AppState interface fields (`name: () => void` / `Promise<void>` with no body).
    if (/:\s*(?:async\s*)?\([^)]*\)\s*=>\s*(?:void|Promise<void>)\s*$/m.test(window.split('\n')[0])) {
      from = i + needle.length
      continue
    }
    start = i
    break
  }
  assert.ok(start >= 0, `${name} implementation exists`)
  const end = storeSrc.indexOf(`  ${next}:`, start + 1)
  assert.ok(end > start, `${name} has a bounded body before ${next}`)
  return storeSrc.slice(start, end)
}

test('Save/Export share the durable download helper (File System Access + hardened anchor)', () => {
  assert.match(downloadSrc, /showSaveFilePicker/)
  assert.match(downloadSrc, /document\.body\.appendChild\(a\)/)
  assert.match(downloadSrc, /AbortError/)
  assert.match(storeSrc, /from '\.\/io\/download'/)
  assert.match(storeSrc, /durableDownload/)
  assert.match(storeSrc, /function triggerDownload[\s\S]*void durableDownload/)
})

test('saveProject awaits durableDownload and never claims success on abort/failure', () => {
  const body = impl('saveProject', 'openProject')
  assert.match(body, /saveProject: async/)
  assert.match(body, /await durableDownload\(/)
  assert.match(body, /已取消保存（现有模型未动）/)
  assert.match(body, /保存失败：无法写入文件/)
  assert.match(body, /现有模型未动/)
  assert.doesNotMatch(body, /triggerDownload\(new TextEncoder/)
})

test('openProject prefers showOpenFilePicker and keeps the document on cancel/bad JSON', () => {
  const body = impl('openProject', 'applyProjectData')
  assert.match(body, /showOpenFilePicker/)
  assert.match(body, /已取消打开（现有模型未动）/)
  assert.match(body, /打开失败：文件格式不正确（现有模型未动）/)
  assert.match(body, /applyProjectData/)
})

test('durableDownload writes via file picker and falls back to anchor', async () => {
  const { durableDownload } = await import('../src/io/download.ts')

  const writes = []
  const handle = {
    createWritable: async () => ({
      write: async (chunk) => { writes.push(chunk) },
      close: async () => {},
    }),
  }
  globalThis.window = globalThis
  globalThis.window.showSaveFilePicker = async () => handle
  globalThis.document = {
    createElement() { throw new Error('anchor must not run when picker succeeds') },
    body: { appendChild() {} },
  }

  const bytes = new TextEncoder().encode('{"app":"webcad"}')
  const ok = await durableDownload(bytes, 'demo.json', 'application/json')
  assert.deepEqual(ok, { ok: true, method: 'file-picker' })
  assert.equal(writes.length, 1)
  const written = writes[0]
  const buf = written instanceof Blob ? new Uint8Array(await written.arrayBuffer()) : writes[0]
  assert.equal(new TextDecoder().decode(buf), '{"app":"webcad"}')

  globalThis.window.showSaveFilePicker = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e }
  const aborted = await durableDownload(bytes, 'demo.json', 'application/json')
  assert.deepEqual(aborted, { ok: false, reason: 'aborted' })

  delete globalThis.window.showSaveFilePicker
  const clicks = []
  const el = {
    style: {},
    click() { clicks.push(this.download) },
    remove() {},
  }
  globalThis.URL = { createObjectURL: () => 'blob:test', revokeObjectURL() {} }
  globalThis.Blob = class { constructor() {} }
  globalThis.document = {
    createElement: () => el,
    body: { appendChild(node) { assert.equal(node, el) } },
  }
  const anchor = await durableDownload(bytes, 'demo.json', 'application/json')
  assert.deepEqual(anchor, { ok: true, method: 'anchor' })
  assert.deepEqual(clicks, ['demo.json'])
})
