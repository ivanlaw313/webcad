import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const baseURL = (process.argv[2] ?? 'http://127.0.0.1:4173').replace(/\/$/, '')
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const browser = await chromium.launch({ headless: true, executablePath })

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.addInitScript(() => {
    globalThis.__rosWire = []
    class MockWebSocket {
      constructor(url) {
        this.url = url
        this.readyState = 0
        this.listeners = new Map()
        setTimeout(() => { this.readyState = 1; this.emit('open', {}) }, 0)
      }
      addEventListener(type, listener) {
        const list = this.listeners.get(type) ?? []
        list.push(listener)
        this.listeners.set(type, list)
      }
      emit(type, event) { for (const listener of this.listeners.get(type) ?? []) listener(event) }
      send(raw) {
        const message = JSON.parse(raw)
        globalThis.__rosWire.push(message)
        if (message.op === 'subscribe' && message.topic === '/webcad/cmd_vel') {
          setTimeout(() => this.emit('message', { data: JSON.stringify({
            op: 'publish', topic: '/webcad/cmd_vel',
            msg: { linear: { x: 7.5, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0.4 } },
          }) }), 0)
        }
      }
      close() { this.readyState = 3; this.emit('close', {}) }
    }
    globalThis.WebSocket = MockWebSocket
  })
  await page.goto(`${baseURL}/?ui-test=1`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('[data-ribbon-group="CREATE"]').click()
  await page.locator('.panel-menu-item[data-cmd="box"]').click()
  const dialog = page.locator('[data-testid="command-dialog"]')
  await dialog.waitFor({ state: 'visible' })
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  await page.getByText(/特征 \(1\)/).waitFor({ state: 'visible', timeout: 60000 })

  await page.keyboard.press('/')
  await page.locator('input:focus').fill('physicslab')
  await page.locator('[data-i="0"]').click()
  const lab = page.locator('.physics-lab')
  await lab.waitFor({ state: 'visible' })
  await lab.locator('[data-testid="physics-cad-ground-enabled"]').check()
  await lab.locator('[data-testid="physics-rosbridge-url"]').fill('ws://mock-rosbridge:9090')
  await lab.locator('[data-testid="physics-rosbridge-connect"]').click()
  await lab.locator('[data-testid="physics-rosbridge-status"]').getByText(/connected/).waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.querySelector('[data-testid="physics-cad-ground-target-speed"]')?.value === '7.5')
  assert.ok(Math.abs(Number(await lab.locator('[data-testid="physics-cad-ground-steering"]').inputValue())) > 0)

  await lab.locator('[data-testid="physics-fast-forward-enabled"]').check()
  await lab.locator('[data-testid="physics-fast-forward-steps"]').fill('240')
  await lab.locator('[data-testid="physics-stop-at-seconds"]').fill('1')
  await lab.locator('.physics-lab-header-actions .primary').click()
  await page.waitForFunction(() => Number.parseFloat(document.querySelector('[data-testid="physics-simulation-time"]')?.textContent ?? '0') >= 1)
  await page.waitForFunction(() => globalThis.__rosWire.some((message) => {
    if (message.op !== 'publish' || message.topic !== '/webcad/simulation_state') return false
    return JSON.parse(message.msg.data).simulationTimeS > 0
  }))
  const wire = await page.evaluate(() => globalThis.__rosWire)
  assert.ok(wire.some((message) => message.op === 'subscribe' && message.topic === '/webcad/cmd_vel'))
  assert.ok(wire.some((message) => message.op === 'advertise' && message.topic === '/webcad/simulation_state'))
  const telemetry = wire.filter((message) => message.op === 'publish' && message.topic === '/webcad/simulation_state')
  assert.ok(telemetry.length > 0)
  assert.ok(JSON.parse(telemetry.at(-1).msg.data).simulationTimeS > 0)

  const reportPromise = page.waitForEvent('download')
  await lab.getByRole('button', { name: '報告' }).click()
  const report = JSON.parse(await readFile(await (await reportPromise).path(), 'utf8'))
  const ros = report.settings?.activeCadGroundVehicle?.rosBridge
  assert.equal(ros?.protocol, 'rosbridge-v2-json')
  assert.equal(ros?.lastCommand?.linearMps, 7.5)
  assert.equal(ros?.lastCommand?.angularRadS, 0.4)
  assert.ok(ros?.publishedMessages > 0)
  console.log(JSON.stringify({ ok: true, target: baseURL, rosbridge: 'cmd-vel-to-ground-drive-and-10hz-state' }))
} finally {
  await browser.close()
}
