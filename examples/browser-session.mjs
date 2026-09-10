// Public Playwright BrowserServer API exposes the PID for bounded runner cleanup.
import { chromium as playwrightChromium } from 'playwright'
export const chromium = {
  async launch(options) {
    const server = await playwrightChromium.launchServer(options)
    process.send?.({ type: 'webcad-browser-owned', pid: server.process().pid })
    try {
      const browser = await playwrightChromium.connect(server.wsEndpoint())
      const close = browser.close.bind(browser)
      browser.close = async () => { try { await close() } finally { await server.close() } }
      return browser
    } catch (error) { await server.close(); throw error }
  },
}
