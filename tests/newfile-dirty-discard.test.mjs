// FILE-IO dirty-doc：File ▸ New / 開新檔案 — Formal Traditional 儲存／不儲存／取消
// 取消＝保留；不儲存＝reset 清幾何／重建警告；儲存路徑僅在「已儲存專案」後先開新檔。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { msg } = await import('../src/i18n.ts')
const g = () => useApp.getState()

async function seedDirtyDoc() {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({ lang: 'zh-HK' })
  await g().applyFeatures([{
    id: 'b1', type: 'extrude',
    profile: { kind: 'rect', a: [-20, -20], b: [20, 20] },
    height: 30, operation: 'new',
  }], 'seed')
  useApp.setState({
    lastBuildWarnings: ['⚠ 圓角：部分邊失敗'],
    failedFeatureIds: ['f1'],
    featureErrors: { f1: 'fail' },
    projectName: 'DIRTY-DOC',
  })
  assert.ok(g().features.length >= 1)
  assert.ok(g().lastBuildWarnings.length >= 1)
}

test('i18n Formal Traditional: 儲存／不儲存／取消／開新檔案 title', () => {
  assert.equal(msg('file.saveBtn', 'zh-HK'), '儲存')
  assert.equal(msg('file.dontSave', 'zh-HK'), '不儲存')
  assert.equal(msg('file.newTitle', 'zh-HK'), '開新檔案')
  assert.equal(msg('dlg.cancel', 'zh-HK'), '取消')
  assert.match(msg('file.newConfirm', 'zh-HK'), /不儲存/)
  assert.doesNotMatch(msg('file.dontSave', 'zh-HK'), /不保存|舍弃|丢弃/)
  assert.equal(msg('file.dontSave', 'en'), "Don't Save")
  assert.equal(msg('file.dontSave', 'zh-CN'), '不保存')
})

test('取消 keeps dirty doc (features + warnings + name)', async () => {
  await seedDirtyDoc()
  const before = {
    feats: g().features.length,
    warns: [...g().lastBuildWarnings],
    name: g().projectName,
    failed: [...g().failedFeatureIds],
  }
  const orig = g().appChoice
  useApp.setState({ appChoice: async () => null })
  try {
    await g().newFileFlow()
  } finally {
    useApp.setState({ appChoice: orig })
  }
  assert.equal(g().features.length, before.feats)
  assert.deepEqual(g().lastBuildWarnings, before.warns)
  assert.equal(g().projectName, before.name)
  assert.deepEqual(g().failedFeatureIds, before.failed)
  assert.ok(g().uiDialog == null)
})

test('不儲存 (ok) clears geometry + rebuild warnings', async () => {
  await seedDirtyDoc()
  const orig = g().appChoice
  useApp.setState({ appChoice: async () => 'ok' })
  try {
    await g().newFileFlow()
  } finally {
    useApp.setState({ appChoice: orig })
  }
  assert.equal(g().features.length, 0)
  assert.deepEqual(g().lastBuildWarnings, [])
  assert.deepEqual(g().failedFeatureIds, [])
  assert.deepEqual(g().featureErrors, {})
  assert.equal(g().bodyMesh, null)
  assert.match(g().status, /已清空|清空/)
})

test('dialog labels from newFileFlow are Formal Traditional 儲存／不儲存', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({ lang: 'zh-HK' })
  void g().newFileFlow()
  await new Promise((r) => setTimeout(r, 30))
  const d = g().uiDialog
  assert.equal(d?.kind, 'confirm')
  assert.equal(d?.title, '開新檔案')
  assert.equal(d?.alt, '儲存')
  assert.equal(d?.okLabel, '不儲存')
  assert.match(d?.msg || '', /儲存/)
  g().resolveDialog(false) // 取消
  await new Promise((r) => setTimeout(r, 10))
})

test('儲存 path that does not land keeps the document', async () => {
  await seedDirtyDoc()
  const beforeFeats = g().features.length
  const origChoice = g().appChoice
  const origSave = g().saveProject
  useApp.setState({
    appChoice: async () => 'alt',
    saveProject: async () => { useApp.setState({ status: '已取消儲存' }) },
  })
  try {
    await g().newFileFlow()
  } finally {
    useApp.setState({ appChoice: origChoice, saveProject: origSave })
  }
  assert.equal(g().features.length, beforeFeats, 'failed/cancelled save must not reset')
  assert.ok(g().lastBuildWarnings.length >= 1)
})
