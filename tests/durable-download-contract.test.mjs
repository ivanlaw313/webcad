// BUG-UI-002 / Save-Export P0: Save must prefer a durable File System Access
// write (or a hardened in-document anchor download), report cancel/failure
// without claiming success only when both paths fail, and Open must refuse bad
// JSON without wiping. v1.3 harden: picker cancel / webdriver → named File anchor.
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
  assert.match(downloadSrc, /setAttribute\('download'/)
  assert.match(downloadSrc, /new File\(/)
  assert.match(downloadSrc, /ANCHOR_REVOKE_MS/)
  assert.match(downloadSrc, /navigator\.webdriver/)
  assert.match(downloadSrc, /AbortError/)
  assert.match(storeSrc, /from '\.\/io\/download'/)
  assert.match(storeSrc, /durableDownload/)
  assert.match(storeSrc, /durableDownloadFrom/)
  assert.match(storeSrc, /function triggerDownload[\s\S]*void durableDownload/)
})

test('saveProject uses durableDownloadFrom (picker before JSON) and never claims success on failure', () => {
  const body = impl('saveProject', 'openProject')
  assert.match(body, /saveProject: async/)
  assert.match(body, /await durableDownloadFrom\(/)
  assert.match(body, /JSON\.stringify/)
  assert.match(body, /已取消保存（现有模型未动）/)
  assert.match(body, /保存失败：无法写入文件/)
  assert.match(body, /现有模型未动/)
  assert.match(body, /已下载到浏览器下载目录/)
  assert.doesNotMatch(body, /triggerDownload\(new TextEncoder/)
  assert.doesNotMatch(body, /await durableDownload\(/)
})

test('openProject prefers showOpenFilePicker and keeps the document on cancel/bad JSON', () => {
  const body = impl('openProject', 'applyProjectData')
  assert.match(body, /showOpenFilePicker/)
  assert.match(body, /已取消打开（现有模型未动）/)
  assert.match(body, /打开失败：文件格式不正确（现有模型未动）/)
  assert.match(body, /applyProjectData/)
})

test('durableDownload writes via file picker; cancel/unavailable fall back to named File anchor', async () => {
  const { durableDownload, durableDownloadFrom, anchorDownload } = await import('../src/io/download.ts')

  const writes = []
  const handle = {
    createWritable: async () => ({
      write: async (chunk) => { writes.push(chunk) },
      close: async () => {},
    }),
  }
  globalThis.window = globalThis
  Object.defineProperty(globalThis, 'navigator', { value: { webdriver: false }, configurable: true })
  globalThis.window.showSaveFilePicker = async () => handle
  globalThis.document = {
    createElement() { throw new Error('anchor must not run when picker succeeds') },
    body: { appendChild() {} },
  }
  globalThis.File = class File extends Blob {
    constructor(parts, name, opts) {
      super(parts, opts)
      this.name = name
    }
  }
  globalThis.MouseEvent = class MouseEvent {
    constructor(type, init) { this.type = type; Object.assign(this, init || {}) }
  }

  const bytes = new TextEncoder().encode('{"app":"webcad"}')
  const ok = await durableDownload(bytes, 'demo.json', 'application/json')
  assert.deepEqual(ok, { ok: true, method: 'file-picker' })
  assert.equal(writes.length, 1)
  const written = writes[0]
  const buf = written instanceof Blob ? new Uint8Array(await written.arrayBuffer()) : writes[0]
  assert.equal(new TextDecoder().decode(buf), '{"app":"webcad"}')

  // Picker cancel → hardened anchor (not a hard abort), so Save still lands a download.
  globalThis.window.showSaveFilePicker = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e }
  const clicks = []
  const attrs = {}
  const el = {
    style: {},
    download: '',
    type: '',
    rel: '',
    href: '',
    setAttribute(k, v) { attrs[k] = v; if (k === 'download') this.download = v },
    dispatchEvent(ev) { clicks.push({ via: 'dispatch', download: this.download, type: ev?.type }); return true },
    click() { clicks.push({ via: 'click', download: this.download }) },
    remove() { this.removed = true },
  }
  let revoked = 0
  const blobs = []
  globalThis.URL = {
    createObjectURL: (b) => { blobs.push(b); return 'blob:test-named' },
    revokeObjectURL() { revoked++ },
  }
  globalThis.Blob = class {
    constructor(parts, opts) { this.parts = parts; this.type = opts?.type }
  }
  globalThis.File = class File extends globalThis.Blob {
    constructor(parts, name, opts) {
      super(parts, opts)
      this.name = name
    }
  }
  globalThis.document = {
    createElement: () => el,
    body: { appendChild(node) { assert.equal(node, el); this.attached = node } },
  }
  const anchor = await durableDownload(bytes, 'demo.json', 'application/json')
  assert.deepEqual(anchor, { ok: true, method: 'anchor' })
  assert.equal(attrs.download, 'demo.json')
  assert.equal(el.download, 'demo.json')
  assert.ok(clicks.length >= 1)
  assert.equal(clicks[0].download, 'demo.json')
  assert.equal(blobs[0].name, 'demo.json')
  // Anchor stays in the document until delayed cleanup (not removed synchronously).
  assert.notEqual(el.removed, true)

  // webdriver → skip picker, go straight to named anchor.
  clicks.length = 0
  blobs.length = 0
  Object.defineProperty(globalThis, 'navigator', { value: { webdriver: true }, configurable: true })
  globalThis.window.showSaveFilePicker = async () => { throw new Error('picker must not run under webdriver') }
  const auto = await durableDownload(bytes, 'auto.json', 'application/json')
  assert.deepEqual(auto, { ok: true, method: 'anchor' })
  assert.equal(el.download, 'auto.json')
  assert.equal(blobs[0].name, 'auto.json')

  // durableDownloadFrom: picker before produce; produce runs after handle acquired.
  Object.defineProperty(globalThis, 'navigator', { value: { webdriver: false }, configurable: true })
  let produced = 0
  let pickerCalls = 0
  globalThis.window.showSaveFilePicker = async () => {
    assert.equal(produced, 0, 'produce must not run before picker')
    pickerCalls++
    return handle
  }
  globalThis.document = {
    createElement() { throw new Error('anchor must not run when from-picker succeeds') },
    body: { appendChild() {} },
  }
  writes.length = 0
  const fromOk = await durableDownloadFrom('from.json', 'application/json', () => {
    produced++
    return new TextEncoder().encode('{"from":true}')
  })
  assert.deepEqual(fromOk, { ok: true, method: 'file-picker' })
  assert.equal(pickerCalls, 1)
  assert.equal(produced, 1)

  // durableDownloadFrom cancel → produce + anchor.
  globalThis.window.showSaveFilePicker = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e }
  globalThis.document = {
    createElement: () => el,
    body: { appendChild(node) { assert.equal(node, el) } },
  }
  produced = 0
  const fromAnchor = await durableDownloadFrom('from-cancel.json', 'application/json', () => {
    produced++
    return new TextEncoder().encode('{"from":"cancel"}')
  })
  assert.deepEqual(fromAnchor, { ok: true, method: 'anchor' })
  assert.equal(produced, 1)
  assert.equal(el.download, 'from-cancel.json')

  // Direct anchorDownload helper keeps filename.
  const direct = anchorDownload(bytes, 'direct.json', 'application/json')
  assert.deepEqual(direct, { ok: true, method: 'anchor' })
  assert.equal(el.download, 'direct.json')
  assert.equal(revoked, 0) // revoke is delayed
})
