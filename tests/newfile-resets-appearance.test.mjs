// WORKFLOW2 P2：開新檔／reset 必須還原預設外觀與密度，唔跟上一檔紅色／自訂材質。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

const DEFAULT_COLOR = '#4a7296'

test('reset after custom red body colour restores default blue-grey appearance', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  g().setBodyColor('#ff0000')
  useApp.setState({
    appearanceName: '自訂紅',
    material: { metalness: 0.9, roughness: 0.1, opacity: 0.8, tex: 'brushed' },
    physMatName: '钢',
    bodyDensity: 7.85,
    faceColors: { f1: '#00ff00' },
    faceColorPick: '#00ff00',
    lang: 'zh-HK',
    unit: 'mm',
    graphicsPreset: 'quality',
  })
  assert.equal(g().bodyColor, '#ff0000')
  await g().reset()
  assert.equal(g().bodyColor, DEFAULT_COLOR)
  assert.equal(g().appearanceName, '')
  assert.equal(g().physMatName, '')
  assert.equal(g().bodyDensity, 2.7)
  assert.deepEqual(g().faceColors, {})
  assert.equal(g().faceColorPick, null)
  assert.equal(g().material.metalness, 0.18)
  assert.equal(g().material.roughness, 0.5)
  assert.equal(g().material.opacity, 1)
  // User prefs must survive New File
  assert.equal(g().lang, 'zh-HK')
  assert.equal(g().unit, 'mm')
  assert.equal(g().graphicsPreset, 'quality')
})

test('newFileFlow after confirm-New restores default appearance', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  g().setBodyColor('#cc0000')
  useApp.setState({ appearanceName: '紅', bodyDensity: 1.24, physMatName: 'ABS' })
  const orig = g().appChoice
  useApp.setState({ appChoice: async () => 'ok' })
  try {
    await g().newFileFlow()
  } finally {
    useApp.setState({ appChoice: orig })
  }
  assert.equal(g().bodyColor, DEFAULT_COLOR)
  assert.equal(g().appearanceName, '')
  assert.equal(g().bodyDensity, 2.7)
  assert.equal(g().physMatName, '')
})
