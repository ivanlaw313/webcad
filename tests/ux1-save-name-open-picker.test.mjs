// UX1 #5：未命名文件第一次儲存要問檔名（Fusion「儲存」對話框）；「開啟舊檔案…」同步 click 隱藏 file input（系統揀選器）。
// 真瀏覽器證明：scripts/e2e-file-save-open.mjs。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp, isUntitledProjectName } = await import('../src/store.ts')
const g = () => useApp.getState()

test('isUntitledProjectName recognises the auto names only', () => {
  for (const n of ['', '  ', null, undefined, '未命名零件', '未命名零件 (3)', '未命名', 'Untitled', 'untitled (2)']) assert.equal(isUntitledProjectName(n), true, String(n))
  for (const n of ['支架A', '未命名零件 v2', 'Bracket']) assert.equal(isUntitledProjectName(n), false, n)
})
test('first save of an untitled doc asks for a name; cancel saves nothing', async () => {
  await g().reset()
  const asked = []
  const orig = g().appPrompt
  useApp.setState({ appPrompt: async (msg, def, title) => { asked.push({ msg, def, title }); return null } })
  try {
    await g().saveProject()
    assert.equal(asked.length, 1)
    assert.match(asked[0].title, /儲存|Save|保存/)
    assert.match(g().status, /已取消儲存/)
    assert.equal(g().projectName || '未命名零件', asked[0].def)
  } finally { useApp.setState({ appPrompt: orig }) }
})
test('the typed name becomes the document name and is not asked again', async () => {
  await g().reset()
  const asked = []
  const orig = g().appPrompt
  useApp.setState({ appPrompt: async () => { asked.push(1); return '支架A.json' } })
  try {
    await g().saveProject().catch(() => {})   // node has no download sink — only the naming step matters here
    assert.equal(g().projectName, '支架A')
    await g().saveProject().catch(() => {})
    assert.equal(asked.length, 1)
    await g().reset()                          // New file → untitled again → asks again
    await g().saveProject().catch(() => {})
    assert.equal(asked.length, 2)
  } finally { useApp.setState({ appPrompt: orig }) }
})
test('a named document (e.g. renamed / opened) saves without asking', async () => {
  await g().reset()
  let asked = 0
  const orig = g().appPrompt
  useApp.setState({ projectName: '外殼', appPrompt: async () => { asked++; return 'x' } })
  try { await g().saveProject().catch(() => {}); assert.equal(asked, 0) } finally { useApp.setState({ appPrompt: orig }) }
})
