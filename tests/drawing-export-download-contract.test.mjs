// BUG-UI-008: DrawingPanel SVG/PNG/PDF/DXF export must prefer durable File System
// Access writes (or hardened in-document <a download>), not a detached blob <a>.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panelSrc = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const downloadSrc = readFileSync(new URL('../src/io/download.ts', import.meta.url), 'utf8')

test('durable download helper prefers showSaveFilePicker with in-document anchor fallback', () => {
  assert.match(downloadSrc, /showSaveFilePicker/)
  assert.match(downloadSrc, /document\.body\.appendChild\(a\)/)
  assert.match(downloadSrc, /AbortError/)
  assert.match(downloadSrc, /export async function durableDownload/)
})

test('DrawingPanel SVG/PNG/PDF/DXF exports call durableDownload via finishDrawingExport', () => {
  assert.match(panelSrc, /from '\.\.\/io\/download'/)
  assert.match(panelSrc, /finishDrawingExport/)
  assert.match(panelSrc, /BUG-UI-008/)
  for (const label of ['SVG', 'PNG', 'PDF', 'DXF']) {
    assert.match(panelSrc, new RegExp(`finishDrawingExport\\([\\s\\S]*?'${label}'\\)`))
  }
  // Detached ephemeral <a download> must not remain on the drawing export paths.
  assert.doesNotMatch(panelSrc, /a\.download\s*=\s*`[^`]*工程图\.(svg|png|pdf)`/)
  assert.doesNotMatch(panelSrc, /a\.download\s*=\s*'webcad-drawing\.dxf'/)
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

  const bytes = new TextEncoder().encode('<svg/>')
  const ok = await durableDownload(bytes, 'demo-drawing.svg', 'image/svg+xml')
  assert.deepEqual(ok, { ok: true, method: 'file-picker' })
  assert.equal(writes.length, 1)
  const written = writes[0]
  const buf = written instanceof Blob ? new Uint8Array(await written.arrayBuffer()) : writes[0]
  assert.equal(new TextDecoder().decode(buf), '<svg/>')

  globalThis.window.showSaveFilePicker = async () => { const e = new Error('cancel'); e.name = 'AbortError'; throw e }
  const aborted = await durableDownload(bytes, 'demo-drawing.svg', 'image/svg+xml')
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
  const anchor = await durableDownload(bytes, 'demo-drawing.svg', 'image/svg+xml')
  assert.deepEqual(anchor, { ok: true, method: 'anchor' })
  assert.deepEqual(clicks, ['demo-drawing.svg'])
})
